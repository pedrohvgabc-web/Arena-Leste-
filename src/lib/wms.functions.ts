import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "./db.server";

const WMS_COOKIE = "ae_wms";
const SESSION_HOURS = 8;

type Role = "admin_remote" | "caixa_local";
type Actor = { id: string; name: string; role: Role };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function token() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}
async function cookie(name: string) {
  const { getCookie } = await import("@tanstack/react-start/server");
  return getCookie(name);
}
async function setWmsCookie(value: string) {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(WMS_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}
async function clearWmsCookie() {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(WMS_COOKIE, { path: "/", secure: true, sameSite: "none" });
}
async function adminActor(): Promise<Actor | null> {
  try {
    const { requireAdmin } = await import("./admin-auth.server");
    const id = await requireAdmin();
    return { id, name: "Admin remoto", role: "admin_remote" };
  } catch {
    return null;
  }
}
async function currentActor(): Promise<Actor> {
  const admin = await adminActor();
  if (admin) return admin;
  const session = await cookie(WMS_COOKIE);
  if (!session) throw new Error("UNAUTHORIZED");
  const db = getDb();
  const rows = (await db`
    SELECT u.id::text, u.display_name AS name, u.role
    FROM public.wms_sessions s JOIN public.wms_users u ON u.id = s.user_id
    WHERE s.token_hash = ${await sha256(session)} AND s.expires_at > now() AND u.active = true LIMIT 1
  `) as unknown as Array<{ id: string; name: string; role: Role }>;
  if (!rows[0]) throw new Error("UNAUTHORIZED");
  return rows[0];
}
async function requireRole(roles: Role[]) {
  const actor = await currentActor();
  if (!roles.includes(actor.role)) throw new Error("FORBIDDEN");
  return actor;
}
async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  details: unknown,
) {
  const db = getDb();
  await db`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, ${action}, ${entity}, ${entityId}, ${JSON.stringify({ role: actor.role, ...((details ?? {}) as object) })}::jsonb)`;
}

export const wmsAuthCheck = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return { authed: true, actor: await currentActor() };
  } catch {
    return { authed: false, actor: null };
  }
});

export const wmsLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const adminPassword = process.env["ADMIN_PASSWORD"];
    if (
      data.username.toLowerCase() === "admin" &&
      adminPassword &&
      (await sha256(data.password)) === (await sha256(adminPassword))
    ) {
      const actor: Actor = { id: "admin", name: "Admin remoto", role: "admin_remote" };
      const adminToken = token();
      await db`INSERT INTO public.admin_sessions (token_hash, expires_at) VALUES (${await sha256(adminToken)}, ${new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString()}::timestamptz)`;
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie("ae_admin", adminToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: SESSION_HOURS * 3600,
      });
      await audit(actor, "wms.login", "session", null, {});
      return { ok: true, actor };
    }
    const rows =
      (await db`SELECT id::text, display_name AS name, role, password_hash FROM public.wms_users WHERE username = ${data.username} AND active = true LIMIT 1`) as unknown as Array<{
        id: string;
        name: string;
        role: Role;
        password_hash: string;
      }>;
    if (!rows[0] || rows[0].password_hash !== (await sha256(data.password)))
      return { ok: false, error: "Credenciais inválidas." };
    const raw = token();
    await db`INSERT INTO public.wms_sessions (user_id, token_hash, expires_at) VALUES (${rows[0].id}::uuid, ${await sha256(raw)}, ${new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString()}::timestamptz)`;
    await setWmsCookie(raw);
    const actor = { id: rows[0].id, name: rows[0].name, role: rows[0].role };
    await audit(actor, "wms.login", "session", rows[0].id, {});
    return { ok: true, actor };
  });

export const wmsLogout = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await cookie(WMS_COOKIE);
  if (raw) await getDb()`DELETE FROM public.wms_sessions WHERE token_hash = ${await sha256(raw)}`;
  await clearWmsCookie();
  return { ok: true };
});

export const wmsDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await currentActor();
  const db = getDb();
  const [products, low, sales, revenue] = await Promise.all([
    db`SELECT count(*)::int AS count FROM public.wms_products WHERE active = true`,
    db`SELECT count(*)::int AS count FROM public.wms_products WHERE active = true AND stock_quantity <= minimum_stock`,
    db`SELECT count(*)::int AS count FROM public.wms_sales WHERE status = 'completed' AND created_at >= current_date`,
    db`SELECT coalesce(sum(total_cents),0)::int AS total FROM public.wms_sales WHERE status = 'completed' AND created_at >= current_date`,
  ]);
  const result: Record<string, unknown> = {
    products: Number((products as any)[0]?.count ?? 0),
    lowStock: Number((low as any)[0]?.count ?? 0),
    salesToday: Number((sales as any)[0]?.count ?? 0),
    revenueTodayCents: Number((revenue as any)[0]?.total ?? 0),
  };
  if (actor.role === "admin_remote") {
    const [margin, movement] = await Promise.all([
      db`SELECT coalesce(sum(i.total_cents - (i.unit_cost_snapshot_cents * i.quantity)),0)::int AS gross_profit, coalesce(sum(i.unit_cost_snapshot_cents * i.quantity),0)::int AS cogs FROM public.wms_sale_items i JOIN public.wms_sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND s.created_at >= current_date`,
      db`SELECT m.id::text, p.name, m.movement_type, m.quantity, m.new_quantity, m.performed_by, m.created_at::text FROM public.wms_stock_movements m JOIN public.wms_products p ON p.id = m.product_id ORDER BY m.created_at DESC LIMIT 8`,
    ]);
    result.grossProfitCents = Number((margin as any)[0]?.gross_profit ?? 0);
    result.cogsCents = Number((margin as any)[0]?.cogs ?? 0);
    result.recentMovements = movement;
  }
  return { actor, ...result };
});

export const wmsProducts = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await currentActor();
  const rows =
    (await getDb()`SELECT p.id::text, p.name, p.sku, p.barcode, p.unit, p.sale_price_cents, p.cost_price_cents, p.stock_quantity, p.minimum_stock, p.reorder_point, p.is_rental, p.active, coalesce(c.name,'Sem categoria') AS category FROM public.wms_products p LEFT JOIN public.wms_categories c ON c.id = p.category_id WHERE p.active = true ORDER BY p.name`) as unknown as Array<
      Record<string, unknown>
    >;
  return rows.map((row) =>
    actor.role === "admin_remote"
      ? row
      : {
          id: row.id,
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          unit: row.unit,
          sale_price_cents: row.sale_price_cents,
          stock_quantity: row.stock_quantity,
          minimum_stock: row.minimum_stock,
          reorder_point: row.reorder_point,
          is_rental: row.is_rental,
          active: row.active,
          category: row.category,
        },
  );
});

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().max(60).nullable(),
  category: z.string().trim().max(60),
  unit: z.string().trim().min(1).max(20),
  salePriceCents: z.number().int().nonnegative(),
  costPriceCents: z.number().int().nonnegative(),
  stockQuantity: z.number().int().nonnegative(),
  minimumStock: z.number().int().nonnegative(),
  reorderPoint: z.number().int().nonnegative(),
  isRental: z.boolean(),
});
export const wmsSaveProduct = createServerFn({ method: "POST" })
  .inputValidator(productInput)
  .handler(async ({ data }) => {
    const actor = await requireRole(["admin_remote"]);
    const db = getDb();
    const category =
      (await db`INSERT INTO public.wms_categories (name) VALUES (${data.category || "Sem categoria"}) ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id`) as unknown as Array<{
        id: string;
      }>;
    return db.begin(async (tx) => {
      let id = data.id;
      if (id) {
        const old =
          (await tx`SELECT sale_price_cents, cost_price_cents FROM public.wms_products WHERE id = ${id}::uuid FOR UPDATE`) as unknown as Array<{
            sale_price_cents: number;
            cost_price_cents: number;
          }>;
        if (!old[0]) throw new Error("Produto não encontrado.");
        await tx`UPDATE public.wms_products SET name=${data.name}, sku=${data.sku}, barcode=${data.barcode || null}, category_id=${category[0].id}::uuid, unit=${data.unit}, sale_price_cents=${data.salePriceCents}, cost_price_cents=${data.costPriceCents}, stock_quantity=${data.stockQuantity}, minimum_stock=${data.minimumStock}, reorder_point=${data.reorderPoint}, is_rental=${data.isRental}, updated_at=now() WHERE id=${id}::uuid`;
        if (
          old[0].sale_price_cents !== data.salePriceCents ||
          old[0].cost_price_cents !== data.costPriceCents
        )
          await tx`INSERT INTO public.wms_price_history (product_id, previous_sale_price_cents, new_sale_price_cents, previous_cost_price_cents, new_cost_price_cents, reason, changed_by) VALUES (${id}::uuid, ${old[0].sale_price_cents}, ${data.salePriceCents}, ${old[0].cost_price_cents}, ${data.costPriceCents}, 'Atualização no painel', ${actor.name})`;
      } else {
        const inserted =
          (await tx`INSERT INTO public.wms_products (name, sku, barcode, category_id, unit, sale_price_cents, cost_price_cents, stock_quantity, minimum_stock, reorder_point, is_rental) VALUES (${data.name},${data.sku},${data.barcode || null},${category[0].id}::uuid,${data.unit},${data.salePriceCents},${data.costPriceCents},${data.stockQuantity},${data.minimumStock},${data.reorderPoint},${data.isRental}) RETURNING id::text`) as unknown as Array<{
            id: string;
          }>;
        id = inserted[0].id;
      }
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.product.save', 'wms_product', ${id}, ${JSON.stringify({ role: actor.role, sku: data.sku })}::jsonb)`;
      return { ok: true, id };
    });
  });

export const wmsCreateSale = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      items: z
        .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() }))
        .min(1),
      channel: z.enum(["counter", "comanda"]),
      paymentMethod: z.enum(["pix", "card", "cash", "pending"]),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole(["admin_remote", "caixa_local"]);
    const db = getDb();
    return db.begin(async (tx) => {
      const sale =
        (await tx`INSERT INTO public.wms_sales (operator_id, channel, payment_method, status) VALUES (${actor.id}, ${data.channel}, ${data.paymentMethod}, ${data.paymentMethod === "pending" ? "pending" : "completed"}) RETURNING id::text`) as unknown as Array<{
          id: string;
        }>;
      let total = 0;
      for (const item of data.items) {
        const rows =
          (await tx`SELECT id::text, sale_price_cents, cost_price_cents, stock_quantity, name FROM public.wms_products WHERE id=${item.productId}::uuid AND active=true FOR UPDATE`) as unknown as Array<{
            id: string;
            sale_price_cents: number;
            cost_price_cents: number;
            stock_quantity: number;
            name: string;
          }>;
        const p = rows[0];
        if (!p) throw new Error("Produto indisponível.");
        if (p.stock_quantity < item.quantity) throw new Error(`Estoque insuficiente: ${p.name}.`);
        const line = p.sale_price_cents * item.quantity;
        total += line;
        await tx`INSERT INTO public.wms_sale_items (sale_id, product_id, quantity, unit_price_cents, unit_cost_snapshot_cents, total_cents) VALUES (${sale[0].id}::uuid, ${p.id}::uuid, ${item.quantity}, ${p.sale_price_cents}, ${p.cost_price_cents}, ${line})`;
        await tx`UPDATE public.wms_products SET stock_quantity=stock_quantity-${item.quantity}, updated_at=now() WHERE id=${p.id}::uuid AND stock_quantity >= ${item.quantity}`;
        await tx`INSERT INTO public.wms_stock_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reference_id, performed_by) VALUES (${p.id}::uuid, 'sale', ${-item.quantity}, ${p.stock_quantity}, ${p.stock_quantity - item.quantity}, ${sale[0].id}::uuid, ${actor.name})`;
      }
      await tx`UPDATE public.wms_sales SET total_cents=${total} WHERE id=${sale[0].id}::uuid`;
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.sale.create', 'wms_sale', ${sale[0].id}, ${JSON.stringify({ role: actor.role, total })}::jsonb)`;
      return { ok: true, saleId: sale[0].id, totalCents: total };
    });
  });

export const wmsStockMovement = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int(),
      movementType: z.enum([
        "purchase_entry",
        "manual_adjustment",
        "return",
        "loss",
        "inventory_count",
      ]),
      reason: z.string().trim().min(3).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole(["admin_remote"]);
    const db = getDb();
    return db.begin(async (tx) => {
      const rows =
        (await tx`SELECT stock_quantity FROM public.wms_products WHERE id=${data.productId}::uuid FOR UPDATE`) as unknown as Array<{
          stock_quantity: number;
        }>;
      if (!rows[0]) throw new Error("Produto não encontrado.");
      const next =
        data.movementType === "inventory_count"
          ? data.quantity
          : rows[0].stock_quantity + data.quantity;
      if (next < 0) throw new Error("O estoque não pode ficar negativo.");
      await tx`UPDATE public.wms_products SET stock_quantity=${next}, updated_at=now() WHERE id=${data.productId}::uuid`;
      await tx`INSERT INTO public.wms_stock_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reason, performed_by) VALUES (${data.productId}::uuid, ${data.movementType}, ${data.movementType === "inventory_count" ? next - rows[0].stock_quantity : data.quantity}, ${rows[0].stock_quantity}, ${next}, ${data.reason}, ${actor.name})`;
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.stock.movement', 'wms_product', ${data.productId}, ${JSON.stringify({ role: actor.role, ...data, newStock: next })}::jsonb)`;
      return { ok: true, stockQuantity: next };
    });
  });

export const wmsAudit = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole(["admin_remote"]);
  return getDb()`SELECT id::text, actor, action, entity, entity_id, details, created_at::text FROM public.audit_logs WHERE action LIKE 'wms.%' ORDER BY created_at DESC LIMIT 120`;
});

export const wmsCreateUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      username: z.string().trim().min(3).max(40),
      displayName: z.string().trim().min(2).max(80),
      password: z.string().min(8).max(200),
      role: z.enum(["admin_remote", "caixa_local"]),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole(["admin_remote"]);
    const db = getDb();
    const rows =
      (await db`INSERT INTO public.wms_users (username, display_name, password_hash, role) VALUES (${data.username}, ${data.displayName}, ${await sha256(data.password)}, ${data.role}) RETURNING id::text`) as unknown as Array<{
        id: string;
      }>;
    await audit(actor, "wms.user.create", "wms_user", rows[0].id, {
      username: data.username,
      role: data.role,
    });
    return { ok: true, id: rows[0].id };
  });
