import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "./db.server";
import { createInfinitePayCheckout } from "./payments.server";
import { paymentCheckoutErrorMessage } from "./payment-errors";

const WMS_COOKIE = "ae_wms";
const SESSION_HOURS = 8;

type Role = "admin_remote" | "caixa_local";
export type WmsTab = "dashboard" | "balcao" | "catalogo" | "estoque" | "auditoria" | "usuarios";
type Actor = { id: string; name: string; role: Role; permissions: WmsTab[] };
const ALL_TABS: WmsTab[] = ["dashboard", "balcao", "catalogo", "estoque", "auditoria", "usuarios"];
const DEFAULT_CASHIER_TABS: WmsTab[] = ["balcao"];
const CASHIER_ALLOWED_TABS: WmsTab[] = ["dashboard", "balcao", "catalogo"];
function normalizeTabs(value: unknown, role: Role): WmsTab[] {
  if (role === "admin_remote") return ALL_TABS;
  if (!Array.isArray(value)) return DEFAULT_CASHIER_TABS;
  const allowed = value.filter(
    (tab): tab is WmsTab =>
      CASHIER_ALLOWED_TABS.includes(tab as WmsTab) && ALL_TABS.includes(tab as WmsTab),
  );
  return allowed.length ? allowed : DEFAULT_CASHIER_TABS;
}

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
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}
async function clearWmsCookie() {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(WMS_COOKIE, { path: "/", secure: true, sameSite: "lax" });
}
async function adminActor(): Promise<Actor | null> {
  try {
    const { requireAdminContext } = await import("./admin-auth.server");
    const admin = await requireAdminContext();
    if (admin.role === "midia") return null;
    return {
      id: admin.id,
      name: admin.name,
      role: admin.role === "master" ? "admin_remote" : "caixa_local",
      permissions: admin.role === "master" ? ALL_TABS : DEFAULT_CASHIER_TABS,
    };
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
    SELECT u.id::text, u.display_name AS name, u.role, u.tab_permissions
    FROM public.wms_sessions s JOIN public.wms_users u ON u.id = s.user_id
    WHERE s.token_hash = ${await sha256(session)} AND s.expires_at > now() AND u.active = true LIMIT 1
  `) as unknown as Array<{ id: string; name: string; role: Role; tab_permissions: unknown }>;
  if (!rows[0]) throw new Error("UNAUTHORIZED");
  return { ...rows[0], permissions: normalizeTabs(rows[0].tab_permissions, rows[0].role) };
}
async function requireRole(roles: Role[]) {
  const actor = await currentActor();
  if (!roles.includes(actor.role)) throw new Error("FORBIDDEN");
  return actor;
}
async function requireTab(tab: WmsTab) {
  const actor = await currentActor();
  if (!actor.permissions.includes(tab)) throw new Error("FORBIDDEN_TAB");
  return actor;
}
async function requireAnyTab(tabs: WmsTab[]) {
  const actor = await currentActor();
  if (!tabs.some((tab) => actor.permissions.includes(tab))) throw new Error("FORBIDDEN_TAB");
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
    try {
      const db = getDb();
      const adminPassword = process.env["ADMIN_PASSWORD"];
      const rawUsername = data.username.toLowerCase().trim();
      const normalizedUsername = rawUsername.replace(/[._-]+/g, " ").trim();
      const isAdminUsername =
        normalizedUsername === "admin" ||
        normalizedUsername === "admin master" ||
        normalizedUsername === "master" ||
        normalizedUsername === "admin remoto" ||
        normalizedUsername === "admin@arena leste.com br" ||
        rawUsername === "admin@arena-leste.com.br";
      if (
        isAdminUsername &&
        adminPassword &&
        (await sha256(data.password)) === (await sha256(adminPassword))
      ) {
        const actor: Actor = {
          id: "admin",
          name: "Admin remoto",
          role: "admin_remote",
          permissions: ALL_TABS,
        };
        const adminToken = token();
        await db`INSERT INTO public.admin_sessions (token_hash, expires_at) VALUES (${await sha256(adminToken)}, ${new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString()}::timestamptz)`;
        const { setCookie } = await import("@tanstack/react-start/server");
        setCookie("ae_admin", adminToken, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_HOURS * 3600,
        });
        await audit(actor, "wms.login", "session", null, {});
        return { ok: true, actor };
      }
      const rows =
        (await db`SELECT id::text, display_name AS name, role, password_hash, tab_permissions FROM public.wms_users WHERE username = ${data.username} AND active = true LIMIT 1`) as unknown as Array<{
          id: string;
          name: string;
          role: Role;
          password_hash: string;
          tab_permissions: unknown;
        }>;
      if (!rows[0] || rows[0].password_hash !== (await sha256(data.password)))
        return { ok: false, error: "Credenciais inválidas." };
      const raw = token();
      await db`INSERT INTO public.wms_sessions (user_id, token_hash, expires_at) VALUES (${rows[0].id}::uuid, ${await sha256(raw)}, ${new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString()}::timestamptz)`;
      await setWmsCookie(raw);
      const actor = {
        id: rows[0].id,
        name: rows[0].name,
        role: rows[0].role,
        permissions: normalizeTabs(
          (rows[0] as { tab_permissions?: unknown }).tab_permissions,
          rows[0].role,
        ),
      };
      await audit(actor, "wms.login", "session", rows[0].id, {});
      return { ok: true, actor };
    } catch (error) {
      console.error("WMS login failed", error);
      return {
        ok: false,
        error: "O servidor não conseguiu concluir o login. Tente novamente em instantes.",
      };
    }
  });

export const wmsLogout = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await cookie(WMS_COOKIE);
  if (raw) await getDb()`DELETE FROM public.wms_sessions WHERE token_hash = ${await sha256(raw)}`;
  await clearWmsCookie();
  return { ok: true };
});

export const wmsDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireTab("dashboard");
  const db = getDb();
  const rows = (await db`
    SELECT
      (SELECT count(*)::int FROM public.wms_products WHERE active = true) AS products,
      (SELECT count(*)::int FROM public.wms_products WHERE active = true AND stock_quantity <= minimum_stock) AS low_stock,
      (SELECT count(*)::int FROM public.wms_sales WHERE status = 'completed' AND created_at >= current_date) AS sales_today,
      (SELECT coalesce(sum(total_cents), 0)::int FROM public.wms_sales WHERE status = 'completed' AND created_at >= current_date) AS revenue_today,
      (SELECT coalesce(sum(i.total_cents - (i.unit_cost_snapshot_cents * i.quantity)), 0)::int FROM public.wms_sale_items i JOIN public.wms_sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND s.created_at >= current_date) AS gross_profit,
      (SELECT coalesce(sum(i.unit_cost_snapshot_cents * i.quantity), 0)::int FROM public.wms_sale_items i JOIN public.wms_sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND s.created_at >= current_date) AS cogs,
      (SELECT coalesce(json_agg(movement), '[]'::json) FROM (SELECT m.id::text, p.name, m.movement_type, m.quantity, m.new_quantity, m.performed_by, m.created_at::text FROM public.wms_stock_movements m JOIN public.wms_products p ON p.id = m.product_id ORDER BY m.created_at DESC LIMIT 8) movement) AS recent_movements
  `) as unknown as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  const result: {
    products: number;
    lowStock: number;
    salesToday: number;
    revenueTodayCents: number;
    grossProfitCents?: number;
    cogsCents?: number;
    recentMovements?: Array<{
      id: string;
      name: string;
      movement_type: string;
      quantity: number;
      new_quantity: number;
      performed_by: string;
      created_at: string;
    }>;
  } = {
    products: Number(row["products"] ?? 0),
    lowStock: Number(row["low_stock"] ?? 0),
    salesToday: Number(row["sales_today"] ?? 0),
    revenueTodayCents: Number(row["revenue_today"] ?? 0),
  };
  if (actor.role === "admin_remote") {
    result["grossProfitCents"] = Number(row["gross_profit"] ?? 0);
    result["cogsCents"] = Number(row["cogs"] ?? 0);
    result["recentMovements"] =
      (row["recent_movements"] as
        | Array<{
            id: string;
            name: string;
            movement_type: string;
            quantity: number;
            new_quantity: number;
            performed_by: string;
            created_at: string;
          }>
        | undefined) ?? [];
  }
  return { actor, ...result };
});

export const wmsProducts = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireAnyTab(["balcao", "catalogo", "estoque"]);
  const rows =
    (await getDb()`SELECT p.id::text, p.name, p.sku, p.barcode, p.unit, p.sale_price_cents::int, p.cost_price_cents::int, p.stock_quantity::int, p.minimum_stock::int, p.reorder_point::int, p.is_rental, p.active, coalesce(c.name,'Sem categoria') AS category FROM public.wms_products p LEFT JOIN public.wms_categories c ON c.id = p.category_id WHERE p.active = true ORDER BY lower(p.name), p.created_at DESC`) as unknown as Array<{
      id: string;
      name: string;
      sku: string;
      barcode: string | null;
      unit: string;
      sale_price_cents: number;
      stock_quantity: number;
      minimum_stock: number;
      reorder_point: number;
      is_rental: boolean;
      active: boolean;
      category: string;
    }>;
  return rows.map((row) =>
    actor.role === "admin_remote"
      ? row
      : {
          id: row["id"],
          name: row["name"],
          sku: row["sku"],
          barcode: row["barcode"],
          unit: row["unit"],
          sale_price_cents: row["sale_price_cents"],
          stock_quantity: row["stock_quantity"],
          minimum_stock: row["minimum_stock"],
          reorder_point: row["reorder_point"],
          is_rental: row["is_rental"],
          active: row["active"],
          category: row["category"],
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
    const actor = await requireTab("catalogo");
    if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
    const db = getDb();
    const category =
      (await db`INSERT INTO public.wms_categories (name) VALUES (${data.category || "Sem categoria"}) ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id::text`) as unknown as Array<{
        id: string;
      }>;
    const categoryId = category[0]?.id;
    if (!categoryId) throw new Error("Não foi possível preparar a categoria do produto.");
    return db.begin(async (tx) => {
      let id = data.id;
      if (id) {
        const old =
          (await tx`SELECT sale_price_cents, cost_price_cents FROM public.wms_products WHERE id = ${id}::uuid FOR UPDATE`) as unknown as Array<{
            sale_price_cents: number;
            cost_price_cents: number;
          }>;
        if (!old[0]) throw new Error("Produto não encontrado.");
        await tx`UPDATE public.wms_products SET name=${data.name}, sku=${data.sku}, barcode=${data.barcode || null}, category_id=${categoryId}::uuid, unit=${data.unit}, sale_price_cents=${data.salePriceCents}, cost_price_cents=${data.costPriceCents}, stock_quantity=${data.stockQuantity}, minimum_stock=${data.minimumStock}, reorder_point=${data.reorderPoint}, is_rental=${data.isRental}, updated_at=now() WHERE id=${id}::uuid`;
        if (
          old[0].sale_price_cents !== data.salePriceCents ||
          old[0].cost_price_cents !== data.costPriceCents
        )
          await tx`INSERT INTO public.wms_price_history (product_id, previous_sale_price_cents, new_sale_price_cents, previous_cost_price_cents, new_cost_price_cents, reason, changed_by) VALUES (${id}::uuid, ${old[0].sale_price_cents}, ${data.salePriceCents}, ${old[0].cost_price_cents}, ${data.costPriceCents}, 'Atualização no painel', ${actor.name})`;
      } else {
        const inserted =
          (await tx`INSERT INTO public.wms_products (name, sku, barcode, category_id, unit, sale_price_cents, cost_price_cents, stock_quantity, minimum_stock, reorder_point, is_rental) VALUES (${data.name},${data.sku},${data.barcode || null},${categoryId}::uuid,${data.unit},${data.salePriceCents},${data.costPriceCents},${data.stockQuantity},${data.minimumStock},${data.reorderPoint},${data.isRental}) RETURNING id::text`) as unknown as Array<{
            id: string;
          }>;
        const insertedId = inserted[0]?.id;
        if (!insertedId) throw new Error("Não foi possível salvar o produto.");
        id = insertedId;
      }
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.product.save', 'wms_product', ${id}, ${JSON.stringify({ role: actor.role, sku: data.sku })}::jsonb)`;
      const saved =
        (await tx`SELECT id::text, name, sku, barcode, unit, sale_price_cents::int, cost_price_cents::int, stock_quantity::int, minimum_stock::int, reorder_point::int, is_rental, active, ${data.category || "Sem categoria"} AS category FROM public.wms_products WHERE id=${id}::uuid`) as unknown as Array<{
          id: string;
          name: string;
          sku: string;
          barcode: string | null;
          unit: string;
          sale_price_cents: number;
          stock_quantity: number;
          minimum_stock: number;
          reorder_point: number;
          is_rental: boolean;
          active: boolean;
          category: string;
        }>;
      return { ok: true, id, product: saved[0] ?? null };
    });
  });

export const wmsDeleteProduct = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const actor = await requireTab("catalogo");
    if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
    const db = getDb();
    const rows =
      (await db`UPDATE public.wms_products SET active=false, updated_at=now() WHERE id=${data.id}::uuid AND active=true RETURNING id::text, name, sku`) as unknown as Array<{
        id: string;
        name: string;
        sku: string;
      }>;
    if (!rows[0]) throw new Error("Produto não encontrado ou já excluído.");
    await audit(actor, "wms.product.delete", "wms_product", rows[0].id, {
      name: rows[0].name,
      sku: rows[0].sku,
    });
    return { ok: true, id: rows[0].id };
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
    const actor = await requireTab("balcao");
    const db = getDb();
    return db.begin(async (tx) => {
      const sale =
        (await tx`INSERT INTO public.wms_sales (operator_id, channel, payment_method, status) VALUES (${actor.id}, ${data.channel}, ${data.paymentMethod}, ${data.paymentMethod === "pending" ? "pending" : "completed"}) RETURNING id::text`) as unknown as Array<{
          id: string;
        }>;
      const saleId = sale[0]?.id;
      if (!saleId) throw new Error("Não foi possível iniciar a venda.");
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
        await tx`INSERT INTO public.wms_sale_items (sale_id, product_id, quantity, unit_price_cents, unit_cost_snapshot_cents, total_cents) VALUES (${saleId}::uuid, ${p.id}::uuid, ${item.quantity}, ${p.sale_price_cents}, ${p.cost_price_cents}, ${line})`;
        await tx`UPDATE public.wms_products SET stock_quantity=stock_quantity-${item.quantity}, updated_at=now() WHERE id=${p.id}::uuid AND stock_quantity >= ${item.quantity}`;
        await tx`INSERT INTO public.wms_stock_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reference_id, performed_by) VALUES (${p.id}::uuid, 'sale', ${-item.quantity}, ${p.stock_quantity}, ${p.stock_quantity - item.quantity}, ${saleId}::uuid, ${actor.name})`;
      }
      await tx`UPDATE public.wms_sales SET total_cents=${total} WHERE id=${saleId}::uuid`;
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.sale.create', 'wms_sale', ${saleId}, ${JSON.stringify({ role: actor.role, total })}::jsonb)`;
      return { ok: true, saleId, totalCents: total };
    });
  });

export const wmsCreateCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      items: z
        .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() }))
        .min(1),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireTab("balcao");
    const db = getDb();
    const sale = await db.begin(async (tx) => {
      const inserted =
        (await tx`INSERT INTO public.wms_sales (operator_id, channel, payment_method, status) VALUES (${actor.id}, 'counter', 'infinitepay', 'pending') RETURNING id::text`) as unknown as Array<{
          id: string;
        }>;
      const checkoutSaleId = inserted[0]?.id;
      if (!checkoutSaleId) throw new Error("Não foi possível iniciar a cobrança.");
      let total = 0;
      for (const item of data.items) {
        const rows =
          (await tx`SELECT id::text, name, sale_price_cents, cost_price_cents, stock_quantity FROM public.wms_products WHERE id=${item.productId}::uuid AND active=true FOR UPDATE`) as unknown as Array<{
            id: string;
            name: string;
            sale_price_cents: number;
            cost_price_cents: number;
            stock_quantity: number;
          }>;
        const product = rows[0];
        if (!product) throw new Error("Produto indisponível.");
        if (product.stock_quantity < item.quantity)
          throw new Error(`Estoque insuficiente: ${product.name}.`);
        const line = Number(product.sale_price_cents) * item.quantity;
        total += line;
        await tx`INSERT INTO public.wms_sale_items (sale_id, product_id, quantity, unit_price_cents, unit_cost_snapshot_cents, total_cents) VALUES (${checkoutSaleId}::uuid, ${product.id}::uuid, ${item.quantity}, ${product.sale_price_cents}, ${product.cost_price_cents}, ${line})`;
      }
      const orderNsu = `ALW-${checkoutSaleId}`;
      await tx`UPDATE public.wms_sales SET total_cents=${total}, payment_provider='infinitepay', payment_order_nsu=${orderNsu} WHERE id=${checkoutSaleId}::uuid`;
      await audit(actor, "wms.checkout.create", "wms_sale", checkoutSaleId, { total, orderNsu });
      return { id: checkoutSaleId, orderNsu, total };
    });
    try {
      const checkout = await createInfinitePayCheckout({
        orderNsu: sale.orderNsu,
        amountCents: sale.total,
        description: `Compra Arena Leste ${sale.id}`,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      await db`UPDATE public.wms_sales SET payment_checkout_url=${checkout.checkoutUrl} WHERE id=${sale.id}::uuid`;
      return {
        ok: true,
        saleId: sale.id,
        totalCents: sale.total,
        checkoutUrl: checkout.checkoutUrl,
      };
    } catch (error) {
      await db`UPDATE public.wms_sales SET status='cancelled' WHERE id=${sale.id}::uuid AND status='pending'`;
      return { ok: false as const, error: paymentCheckoutErrorMessage(error, "wms") };
    }
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
    const actor = await requireTab("estoque");
    if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
    const db = getDb();
    return db.begin(async (tx) => {
      const rows =
        (await tx`SELECT stock_quantity FROM public.wms_products WHERE id=${data.productId}::uuid FOR UPDATE`) as unknown as Array<{
          stock_quantity: number;
        }>;
      if (!rows[0]) throw new Error("Produto não encontrado.");
      if (data.movementType === "purchase_entry" && data.quantity <= 0)
        throw new Error("A entrada precisa ser maior que zero.");
      if (data.movementType === "loss" && data.quantity <= 0)
        throw new Error("Informe quantas unidades foram perdidas.");
      const delta = data.movementType === "loss" ? -Math.abs(data.quantity) : data.quantity;
      const next =
        data.movementType === "inventory_count" ? data.quantity : rows[0].stock_quantity + delta;
      if (next < 0) throw new Error("O estoque não pode ficar negativo.");
      await tx`UPDATE public.wms_products SET stock_quantity=${next}, updated_at=now() WHERE id=${data.productId}::uuid`;
      await tx`INSERT INTO public.wms_stock_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reason, performed_by) VALUES (${data.productId}::uuid, ${data.movementType}, ${data.movementType === "inventory_count" ? next - rows[0].stock_quantity : delta}, ${rows[0].stock_quantity}, ${next}, ${data.reason}, ${actor.name})`;
      await tx`INSERT INTO public.audit_logs (actor, action, entity, entity_id, details) VALUES (${actor.name}, 'wms.stock.movement', 'wms_product', ${data.productId}, ${JSON.stringify({ role: actor.role, ...data, newStock: next })}::jsonb)`;
      return { ok: true, stockQuantity: next };
    });
  });

export const wmsAudit = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireTab("auditoria");
  if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
  const rows =
    (await getDb()`SELECT id::text, actor, action, entity, entity_id, details, created_at::text FROM public.audit_logs WHERE action LIKE 'wms.%' ORDER BY created_at DESC LIMIT 120`) as unknown as Array<
      Record<string, unknown>
    >;
  return rows.map((row) => ({
    id: String(row["id"]),
    actor: String(row["actor"]),
    action: String(row["action"]),
    entity: String(row["entity"]),
    entity_id: row["entity_id"] == null ? null : String(row["entity_id"]),
    details: row["details"] ?? {},
    created_at: String(row["created_at"]),
  }));
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
    const actor = await requireTab("usuarios");
    if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
    const db = getDb();
    const rows =
      (await db`INSERT INTO public.wms_users (username, display_name, password_hash, role) VALUES (${data.username}, ${data.displayName}, ${await sha256(data.password)}, ${data.role}) RETURNING id::text`) as unknown as Array<{
        id: string;
      }>;
    const userId = rows[0]?.id;
    if (!userId) throw new Error("Não foi possível criar o usuário.");
    await audit(actor, "wms.user.create", "wms_user", userId, {
      username: data.username,
      role: data.role,
    });
    return { ok: true, id: userId };
  });

const wmsUserInput = z.object({
  id: z.string().uuid().optional(),
  username: z.string().trim().min(3).max(40),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(["admin_remote", "caixa_local"]),
  active: z.boolean().default(true),
  permissions: z
    .array(z.enum(["dashboard", "balcao", "catalogo", "estoque", "auditoria", "usuarios"]))
    .default(["balcao"]),
});

export const wmsUsers = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireTab("usuarios");
  if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
  const rows =
    (await getDb()`SELECT id::text, username, display_name, role, active, tab_permissions, created_at::text FROM public.wms_users ORDER BY CASE role WHEN 'admin_remote' THEN 0 ELSE 1 END, username`) as unknown as Array<
      Record<string, unknown>
    >;
  return rows.map((row) => {
    const role = row["role"] as Role;
    return {
      id: String(row["id"]),
      username: String(row["username"]),
      display_name: String(row["display_name"]),
      role,
      active: Boolean(row["active"]),
      tab_permissions: normalizeTabs(row["tab_permissions"], role),
      created_at: String(row["created_at"]),
    };
  });
});

export const wmsSaveUser = createServerFn({ method: "POST" })
  .inputValidator(wmsUserInput)
  .handler(async ({ data }) => {
    const actor = await requireTab("usuarios");
    if (actor.role !== "admin_remote") throw new Error("FORBIDDEN");
    const db = getDb();
    if (!data.id && !data.password) throw new Error("Informe uma senha inicial.");
    const username = data.username.toLowerCase();
    const passwordHash = data.password ? await sha256(data.password) : null;
    const rows = data.id
      ? await db`
          UPDATE public.wms_users
          SET username=${username}, display_name=${data.displayName}, role=${data.role}, active=${data.active},
              tab_permissions=${JSON.stringify(normalizeTabs(data.permissions, data.role))}::jsonb,
              password_hash=coalesce(${passwordHash}, password_hash)
          WHERE id=${data.id}::uuid RETURNING id::text
        `
      : await db`
          INSERT INTO public.wms_users (username, display_name, password_hash, role, active, tab_permissions)
          VALUES (${username}, ${data.displayName}, ${passwordHash}, ${data.role}, ${data.active}, ${JSON.stringify(normalizeTabs(data.permissions, data.role))}::jsonb)
          RETURNING id::text
        `;
    const id = String((rows as unknown as Array<{ id: string }>)[0]?.id ?? data.id ?? "");
    await audit(actor, data.id ? "wms.user.update" : "wms.user.create", "wms_user", id, {
      username,
      displayName: data.displayName,
      role: data.role,
      active: data.active,
      permissions: normalizeTabs(data.permissions, data.role),
      passwordChanged: Boolean(data.password),
    });
    return { ok: true, id };
  });
