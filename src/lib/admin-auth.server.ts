import { getDb } from "./db.server";

export const ADMIN_COOKIE = "ae_admin";
export const ADMIN_SESSION_HOURS = 8;
export type AdminRole = "master" | "caixa" | "midia";
export type AdminActor = {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
};

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Lê o usuário da sessão atual; sessões antigas continuam sendo Master. */
export async function getAdminContext(): Promise<AdminActor | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  const token = getCookie(ADMIN_COOKIE);
  if (!token) return null;

  const db = getDb();
  const rows = (await db`
    SELECT s.id::text AS session_id, u.id::text, u.username, u.display_name AS name,
      coalesce(u.role, 'master') AS role
    FROM public.admin_sessions s
    LEFT JOIN public.admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ${await sha256(token)}
      AND s.expires_at > now()
      AND (u.id IS NULL OR u.active = true)
    LIMIT 1
  `) as unknown as Array<{
    session_id: string;
    id: string | null;
    username: string | null;
    name: string | null;
    role: AdminRole;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id ?? "legacy-master",
    username: row.username ?? "master",
    name: row.name ?? "Admin Master",
    role: row.role,
  };
}

export async function requireAdminContext() {
  const actor = await getAdminContext();
  if (!actor) throw new Error("UNAUTHORIZED");
  return actor;
}

export async function requireAdminRole(roles: AdminRole[]) {
  const actor = await requireAdminContext();
  if (!roles.includes(actor.role)) throw new Error("FORBIDDEN");
  return actor;
}

/** Compatibilidade com endpoints antigos que só precisam de sessão válida. */
export async function requireAdmin() {
  return (await requireAdminContext()).id;
}
