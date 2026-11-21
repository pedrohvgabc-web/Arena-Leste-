import { getDb } from "./db.server";
import { SITE } from "./site";
import {
  createReservationPushBody,
  type ReservationPushDetails,
} from "./push-notification-content";
import { sendNotification, setVapidDetails } from "web-push";

export type AdminPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function vapidConfig() {
  const publicKey = process.env["WEB_PUSH_PUBLIC_KEY"]?.trim() ?? "";
  const privateKey = process.env["WEB_PUSH_PRIVATE_KEY"]?.trim() ?? "";
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

export async function getAdminPushSettingsForActor(adminId: string) {
  const keys = vapidConfig();
  if (!keys) return { configured: false, active: false, publicKey: null };

  const db = getDb();
  const rows = (await db`
    SELECT 1 AS found
    FROM public.admin_push_subscriptions
    WHERE admin_id = ${adminId}
    LIMIT 1
  `) as unknown as Array<{ found: number }>;

  return { configured: true, active: rows.length > 0, publicKey: keys.publicKey };
}

export async function saveAdminPushSubscriptionForActor(
  adminId: string,
  subscription: AdminPushSubscriptionInput,
) {
  if (!vapidConfig()) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  const db = getDb();
  await db`
    INSERT INTO public.admin_push_subscriptions (endpoint, admin_id, p256dh, auth)
    VALUES (
      ${subscription.endpoint}, ${adminId}, ${subscription.keys.p256dh}, ${subscription.keys.auth}
    )
    ON CONFLICT (endpoint) DO UPDATE SET
      admin_id = EXCLUDED.admin_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      updated_at = now()
  `;
}

export async function removeAdminPushSubscriptionForActor(adminId: string, endpoint: string) {
  const db = getDb();
  await db`
    DELETE FROM public.admin_push_subscriptions
    WHERE admin_id = ${adminId} AND endpoint = ${endpoint}
  `;
}

function statusCodeOf(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

export async function sendReservationPushToMaster(details: ReservationPushDetails) {
  const keys = vapidConfig();
  if (!keys) return;

  const body = createReservationPushBody(details);
  if (!body) return;

  const db = getDb();
  const subscriptions = (await db`
    SELECT endpoint, p256dh, auth
    FROM public.admin_push_subscriptions
    WHERE admin_id IN (
      SELECT id::text FROM public.admin_users
      WHERE role = 'master' AND active = true
    )
    OR (
      admin_id = 'legacy-master'
      AND EXISTS (
        SELECT 1 FROM public.admin_sessions
        WHERE user_id IS NULL AND expires_at > now()
      )
    )
  `) as unknown as Array<{ endpoint: string; p256dh: string; auth: string }>;

  if (!subscriptions.length) return;

  setVapidDetails(SITE.url, keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ body, tag: `arena-leste-${crypto.randomUUID()}` });
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const target = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      };
      try {
        await sendNotification(target, payload, { TTL: 3600, urgency: "high" });
      } catch (error) {
        const statusCode = statusCodeOf(error);
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(subscription.endpoint);
        else console.warn("Falha ao entregar push de reserva", { statusCode });
      }
    }),
  );

  if (staleEndpoints.length) {
    await db`
      DELETE FROM public.admin_push_subscriptions
      WHERE endpoint = ANY(${staleEndpoints})
    `;
  }
}
