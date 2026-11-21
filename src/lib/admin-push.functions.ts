import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminRole } from "./admin-auth.server";

const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((endpoint) => new URL(endpoint).protocol === "https:", "Use um endpoint HTTPS."),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

const endpointSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export const getAdminPushSettings = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireAdminRole(["master"]);
  const { getAdminPushSettingsForActor } = await import("./admin-push.service");
  return getAdminPushSettingsForActor(actor.id);
});

export const saveAdminPushSubscription = createServerFn({ method: "POST" })
  .inputValidator(pushSubscriptionSchema)
  .handler(async ({ data }) => {
    const actor = await requireAdminRole(["master"]);
    const { saveAdminPushSubscriptionForActor } = await import("./admin-push.service");
    await saveAdminPushSubscriptionForActor(actor.id, data);
    return { ok: true as const };
  });

export const removeAdminPushSubscription = createServerFn({ method: "POST" })
  .inputValidator(endpointSchema)
  .handler(async ({ data }) => {
    const actor = await requireAdminRole(["master"]);
    const { removeAdminPushSubscriptionForActor } = await import("./admin-push.service");
    await removeAdminPushSubscriptionForActor(actor.id, data.endpoint);
    return { ok: true as const };
  });
