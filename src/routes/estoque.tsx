import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Barcode,
  Boxes,
  CheckCircle2,
  ChartNoAxesCombined,
  ClipboardList,
  CircleHelp,
  ArrowRight,
  LogIn,
  LogOut,
  PackagePlus,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
  UserPlus,
  WalletCards,
} from "lucide-react";
import {
  wmsAuthCheck,
  wmsCreateSale,
  wmsCreateUser,
  wmsDashboard,
  wmsLogin,
  wmsLogout,
  wmsProducts,
  wmsSaveProduct,
  wmsStockMovement,
  wmsAudit,
} from "@/lib/wms.functions";
import { SITE } from "@/lib/site";

type Actor = { id: string; name: string; role: "admin_remote" | "caixa_local" };
type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string;
  unit: string;
  sale_price_cents: number;
  cost_price_cents?: number;
  stock_quantity: number;
  minimum_stock: number;
  reorder_point: number;
  is_rental: boolean;
};
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const roleLabel = (r: Actor["role"]) => (r === "admin_remote" ? "Admin remoto" : "Caixa local");
const parseReais = (value: string) => {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
};
const formatReaisInput = (cents?: number) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

export const Route = createFileRoute("/estoque")({
  head: () => ({
    meta: [
      { title: `Estoque & PDV — ${SITE.name}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WmsPage,
});

function WmsPage() {
  const auth = useQuery({
    queryKey: ["wms-auth"],
    queryFn: () => useServerFn(wmsAuthCheck)(),
    retry: false,
  });
  if (auth.isLoading) return <ScreenMessage text="Abrindo operação…" />;
  return auth.data?.authed ? <WmsShell actor={auth.data.actor as Actor} /> : <Login />;
}
function ScreenMessage({ text }: { text: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#171219] font-display text-2xl font-bold uppercase text-primary">
      {text}
    </div>
  );
}
function Login() {
  const login = useServerFn(wmsLogin);
  const authCheck = useServerFn(wmsAuthCheck);
  const qc = useQueryClient();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await login({ data: { username, password } });
      if (!result.ok) {
        toast.error(result.error || "Credenciais inválidas.");
        return;
      }
      const session = await authCheck();
      if (!session.authed) {
        toast.error("O login foi aceito, mas a sessão não foi gravada. Tente novamente.");
        return;
      }
      setPassword("");
      qc.setQueryData(["wms-auth"], session);
    } catch (error) {
      console.error("WMS login failed", error);
      toast.error(
        "Não foi possível concluir o login. Verifique a configuração do WMS e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#171219] px-4 py-10 text-[#fff8f1]">
      <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-[#211a23] p-7 shadow-2xl">
        <p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-primary">
          Arena Leste · WMS / PDV
        </p>
        <h1 className="mt-3 font-display text-5xl font-extrabold uppercase leading-[.86]">
          Estoque
          <br />
          <span className="text-primary">em movimento.</span>
        </h1>
        <p className="mt-4 text-sm text-white/60">Acesse o painel remoto ou o balcão de vendas.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Usuário">
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field label="Senha">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {busy ? "Entrando…" : "Entrar no WMS"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-white/40">
          Admin remoto usa a senha administrativa atual. Contas de Caixa são criadas dentro do
          painel.
        </p>
      </div>
    </main>
  );
}
function WmsShell({ actor }: { actor: Actor }) {
  const logout = useServerFn(wmsLogout);
  const qc = useQueryClient();
  const [tab, setTab] = useState(actor.role === "caixa_local" ? "balcao" : "dashboard");
  const [guideOpen, setGuideOpen] = useState(
    () =>
      actor.role === "admin_remote" &&
      typeof window !== "undefined" &&
      localStorage.getItem("arena-wms-guide-seen") !== "1",
  );
  const tabs =
    actor.role === "admin_remote"
      ? [
          ["dashboard", "Visão geral", ChartNoAxesCombined],
          ["balcao", "Balcão / PDV", ShoppingCart],
          ["catalogo", "Catálogo", Boxes],
          ["estoque", "Inventário", PackagePlus],
          ["auditoria", "Auditoria", ClipboardList],
          ["usuarios", "Usuários", ShieldCheck],
        ]
      : [
          ["balcao", "Balcão / PDV", ShoppingCart],
          ["catalogo", "Produtos", Boxes],
        ];
  async function signOut() {
    await logout();
    await qc.invalidateQueries({ queryKey: ["wms-auth"] });
  }
  return (
    <div className="min-h-screen bg-[#171219] text-[#fff8f1]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#171219]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-primary">
              Arena Leste · WMS
            </p>
            <h1 className="font-display text-2xl font-extrabold uppercase leading-none">
              Estoque <span className="text-primary">& PDV</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary sm:inline-flex">
              {roleLabel(actor.role)}
            </span>
            <button
              onClick={signOut}
              className="rounded-lg border border-white/10 p-2 text-white/60 hover:border-primary hover:text-primary"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 pb-2 lg:px-8">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as string)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide ${tab === id ? "bg-primary text-primary-foreground" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-7 lg:px-8">
        {actor.role === "admin_remote" && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <CircleHelp className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm">
                <strong>Primeiro acesso?</strong> Siga o passo a passo para colocar a lojinha para
                funcionar.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary"
              onClick={() => setGuideOpen(true)}
            >
              Abrir guia
            </button>
          </div>
        )}
        {guideOpen && (
          <FirstAccessGuide
            onClose={() => {
              setGuideOpen(false);
              localStorage.setItem("arena-wms-guide-seen", "1");
            }}
            onCatalog={() => {
              setTab("catalogo");
              setGuideOpen(false);
              localStorage.setItem("arena-wms-guide-seen", "1");
            }}
            onInventory={() => {
              setTab("estoque");
              setGuideOpen(false);
              localStorage.setItem("arena-wms-guide-seen", "1");
            }}
          />
        )}
        {tab === "dashboard" && <Dashboard actor={actor} />}
        {tab === "balcao" && <Counter />}
        {tab === "catalogo" && <Catalog actor={actor} />}
        {tab === "estoque" && <Inventory />}
        {tab === "auditoria" && <Audit />}
        {tab === "usuarios" && <Users />}
      </main>
    </div>
  );
}
function FirstAccessGuide({
  onClose,
  onCatalog,
  onInventory,
}: {
  onClose: () => void;
  onCatalog: () => void;
  onInventory: () => void;
}) {
  const steps = [
    {
      n: "01",
      title: "Cadastre o produto",
      copy: "Nome, preço de venda e quantidade inicial. O SKU é gerado para você.",
      action: "Cadastrar agora",
      fn: onCatalog,
    },
    {
      n: "02",
      title: "Registre a entrada",
      copy: "Quando chegar mercadoria nova, informe quantas unidades entraram.",
      action: "Ver entradas",
      fn: onInventory,
    },
    {
      n: "03",
      title: "Faça uma venda",
      copy: "Abra Balcão / PDV, escolha o produto e finalize por Pix, cartão ou dinheiro.",
      action: "Fechar guia",
      fn: onClose,
    },
  ];
  return (
    <section
      className="mb-8 rounded-[1.5rem] border border-primary/35 bg-[radial-gradient(circle_at_90%_0%,rgba(223,79,7,.28),transparent_42%),#211a23] p-5 shadow-2xl sm:p-7"
      aria-labelledby="wms-guide-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-primary">
            guia rápido · 3 passos
          </p>
          <h2
            id="wms-guide-title"
            className="mt-2 font-display text-3xl font-extrabold uppercase sm:text-4xl"
          >
            Comece pela sua primeira mercadoria
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65">
            Você não precisa entender de logística. Cadastre o produto, informe quantas unidades
            chegaram e depois use o Balcão para registrar as vendas.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Fechar guia"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <article key={step.n} className="rounded-xl border border-white/10 bg-black/15 p-4">
            <span className="font-mono text-xs text-primary">{step.n}</span>
            <h3 className="mt-3 font-display text-xl font-bold uppercase">{step.title}</h3>
            <p className="mt-1 min-h-12 text-sm text-white/55">{step.copy}</p>
            <button
              type="button"
              onClick={step.fn}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline"
            >
              {step.action}
              <ArrowRight className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Dashboard({ actor }: { actor: Actor }) {
  const q = useQuery({
    queryKey: ["wms-dashboard"],
    queryFn: () => useServerFn(wmsDashboard)(),
    refetchInterval: 30000,
    refetchOnMount: "always",
  });
  const d = q.data as any;
  if (q.isLoading) return <Loading />;
  if (q.error || !d) return <DataError onRetry={() => void q.refetch()} />;
  const cards = [
    ["Produtos ativos", d.products, Boxes],
    ["Abaixo do mínimo", d.lowStock, PackagePlus],
    ["Vendas hoje", d.salesToday, Receipt],
    ["Faturamento hoje", money(d.revenueTodayCents), WalletCards],
  ];
  return (
    <section>
      <Title
        eyebrow="gestão remota"
        title="Visão geral"
        copy="Acompanhe a operação da lojinha de qualquer lugar."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <article
            key={label as string}
            className="rounded-2xl border border-white/10 bg-[#211a23] p-5"
          >
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-7 text-xs font-semibold uppercase tracking-wide text-white/45">
              {label as string}
            </p>
            <p className="mt-1 font-display text-4xl font-extrabold">{value as string | number}</p>
          </article>
        ))}
      </div>
      {actor.role === "admin_remote" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[.15em] text-primary">CMV do dia</p>
            <p className="mt-2 font-display text-4xl font-extrabold">{money(d.cogsCents ?? 0)}</p>
            <p className="mt-1 text-sm text-white/55">
              Lucro bruto: {money(d.grossProfitCents ?? 0)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-[#211a23] p-5">
            <h3 className="font-display text-xl font-bold uppercase">Últimas movimentações</h3>
            {(d.recentMovements ?? []).slice(0, 5).map((m: any) => (
              <div
                key={m.id}
                className="flex justify-between border-b border-white/10 py-2 text-sm"
              >
                <span>{m.name}</span>
                <span className="font-mono text-xs text-primary">
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity}
                </span>
              </div>
            ))}
          </article>
        </div>
      )}
    </section>
  );
}
function Counter() {
  const productsQ = useQuery({
    queryKey: ["wms-products"],
    queryFn: () => useServerFn(wmsProducts)(),
    refetchOnMount: "always",
  });
  const sale = useServerFn(wmsCreateSale);
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const products = (productsQ.data ?? []) as Product[];
  const filtered = products.filter((p) =>
    `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(term.toLowerCase()),
  );
  const items = products.filter((p) => cart[p.id]);
  const total = items.reduce((sum, p) => sum + p.sale_price_cents * (cart[p.id] ?? 0), 0);
  async function finish(
    paymentMethod: "pix" | "card" | "cash" | "pending",
    channel: "counter" | "comanda",
  ) {
    if (!items.length) return toast.error("Bipe ou selecione um produto.");
    try {
      const r = await sale({
        data: {
          items: items.map((p) => ({ productId: p.id, quantity: cart[p.id] })),
          paymentMethod,
          channel,
        },
      });
      toast.success(`Venda ${money(r.totalCents)} registrada.`);
      setCart({});
      await qc.invalidateQueries({ queryKey: ["wms-products"] });
      await qc.refetchQueries({ queryKey: ["wms-products"], type: "active" });
      await qc.invalidateQueries({ queryKey: ["wms-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  }
  return (
    <section>
      <Title
        eyebrow="operação local"
        title="Balcão rápido"
        copy="Bipe, confirme e baixe o estoque em uma transação."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div>
          <label className="relative block">
            <Barcode className="absolute left-4 top-3.5 h-5 w-5 text-primary" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Bipe o código ou busque por nome / SKU…"
              className="input pl-12"
            />
          </label>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}
                disabled={p.stock_quantity < 1}
                className="rounded-2xl border border-white/10 bg-[#211a23] p-4 text-left hover:border-primary disabled:opacity-40"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-mono text-xs text-primary">{p.stock_quantity}</span>
                </div>
                <p className="mt-2 text-xs text-white/45">
                  {p.sku} · {p.category}
                </p>
                <p className="mt-3 font-display text-2xl font-bold">{money(p.sale_price_cents)}</p>
              </button>
            ))}
          </div>
        </div>
        <aside className="h-fit rounded-2xl border border-white/10 bg-[#211a23] p-5 xl:sticky xl:top-32">
          <div className="flex justify-between">
            <h3 className="font-display text-2xl font-bold uppercase">Venda atual</h3>
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{items.length} itens</span>
          </div>
          <div className="mt-4 divide-y divide-white/10">
            {items.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-white/45">
                    {cart[p.id]} × {money(p.sale_price_cents)}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setCart((c) => {
                      const n = { ...c };
                      delete n[p.id];
                      return n;
                    })
                  }
                  className="text-white/35 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!items.length && (
              <p className="py-8 text-center text-sm text-white/40">Nenhum item adicionado.</p>
            )}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
            <span className="text-sm text-white/50">Total</span>
            <strong className="font-display text-4xl">{money(total)}</strong>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={() => finish("pix", "counter")}
              className="rounded-xl bg-primary px-2 py-3 text-xs font-bold text-primary-foreground"
            >
              Pix
            </button>
            <button
              onClick={() => finish("card", "counter")}
              className="rounded-xl border border-white/15 px-2 py-3 text-xs font-bold"
            >
              Cartão
            </button>
            <button
              onClick={() => finish("cash", "counter")}
              className="rounded-xl border border-white/15 px-2 py-3 text-xs font-bold"
            >
              Dinheiro
            </button>
          </div>
          <button
            onClick={() => finish("pending", "comanda")}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-3 py-3 text-sm font-bold text-primary"
          >
            <ClipboardList className="h-4 w-4" />
            Lançar na comanda
          </button>
        </aside>
      </div>
    </section>
  );
}
function Catalog({ actor }: { actor: Actor }) {
  const q = useQuery({
    queryKey: ["wms-products"],
    queryFn: () => useServerFn(wmsProducts)(),
    refetchOnMount: "always",
  });
  const save = useServerFn(wmsSaveProduct);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const products = (q.data ?? []) as Product[];
  async function saveProduct(data: Partial<Product>) {
    try {
      await save({
        data: {
          ...data,
          name: data.name ?? "",
          sku: data.sku ?? "",
          barcode: data.barcode ?? null,
          category: data.category ?? "Sem categoria",
          unit: data.unit ?? "un",
          salePriceCents: Number(data.sale_price_cents) || 0,
          costPriceCents: Number(data.cost_price_cents) || 0,
          stockQuantity: Number(data.stock_quantity) || 0,
          minimumStock: Number(data.minimum_stock) || 0,
          reorderPoint: Number(data.reorder_point) || 0,
          isRental: data.is_rental ?? false,
        },
      });
      toast.success("Produto salvo.");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["wms-products"] });
      await qc.refetchQueries({ queryKey: ["wms-products"], type: "active" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }
  return (
    <section>
      <Title
        eyebrow="cadastro de SKUs"
        title="Catálogo"
        copy={
          actor.role === "admin_remote"
            ? "Preços, custos, margem e reposição em um só lugar."
            : "Produtos disponíveis para o balcão."
        }
        action={
          actor.role === "admin_remote" ? (
            <button
              onClick={() =>
                setEditing({
                  category: "Bebidas",
                  unit: "un",
                  sale_price_cents: 0,
                  cost_price_cents: 0,
                  stock_quantity: 0,
                  minimum_stock: 0,
                  reorder_point: 0,
                  is_rental: false,
                })
              }
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Novo SKU
            </button>
          ) : undefined
        }
      />
      {editing && (
        <ProductForm value={editing} onClose={() => setEditing(null)} onSave={saveProduct} />
      )}
      {q.isLoading && <Loading />}
      {q.error && (
        <div className="rounded-2xl border border-red-300/30 bg-red-950/20 p-5 text-sm text-red-100">
          Não foi possível carregar os produtos. Atualize a página e tente novamente.
        </div>
      )}
      {!q.isLoading && !q.error && products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-3 font-display text-2xl font-bold uppercase">Ainda não há produtos</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            Cadastre sua primeira bebida, comida ou material esportivo. É rápido e o código interno
            será gerado automaticamente.
          </p>
          {actor.role === "admin_remote" && (
            <button
              type="button"
              onClick={() =>
                setEditing({
                  category: "Bebidas",
                  unit: "un",
                  sale_price_cents: 0,
                  cost_price_cents: 0,
                  stock_quantity: 0,
                  minimum_stock: 0,
                  reorder_point: 0,
                  is_rental: false,
                })
              }
              className="mt-4 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              Cadastrar primeiro produto
            </button>
          )}
        </div>
      )}
      {products.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#211a23]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="p-4">Produto</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Estoque</th>
                <th className="p-4">Venda</th>
                {actor.role === "admin_remote" && (
                  <>
                    <th className="p-4">Custo</th>
                    <th className="p-4">Margem</th>
                    <th className="p-4">Ação</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="p-4">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-white/40">{p.category}</p>
                  </td>
                  <td className="p-4 font-mono text-xs text-white/55">{p.sku}</td>
                  <td
                    className={`p-4 font-mono ${p.stock_quantity <= p.minimum_stock ? "text-amber-300" : "text-emerald-300"}`}
                  >
                    {p.stock_quantity} {p.unit}
                  </td>
                  <td className="p-4 font-mono">{money(p.sale_price_cents)}</td>
                  {actor.role === "admin_remote" && (
                    <>
                      <td className="p-4 font-mono">{money(p.cost_price_cents ?? 0)}</td>
                      <td className="p-4 font-mono text-primary">
                        {p.sale_price_cents
                          ? `${Math.round(((p.sale_price_cents - (p.cost_price_cents ?? 0)) / p.sale_price_cents) * 100)}%`
                          : "—"}
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          className="font-semibold text-primary hover:underline"
                          onClick={() => setEditing(p)}
                        >
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ProductForm({
  value,
  onClose,
  onSave,
}: {
  value: Partial<Product>;
  onClose: () => void;
  onSave: (v: Partial<Product>) => Promise<void>;
}) {
  const [v, setV] = useState<any>(value);
  const [salePrice, setSalePrice] = useState(formatReaisInput(value.sale_price_cents));
  const [costPrice, setCostPrice] = useState(formatReaisInput(value.cost_price_cents));
  const f = (key: keyof Product, label: string, type = "text", placeholder?: string) => (
    <label className="block text-sm font-semibold text-white/75">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        value={(v[key] as string | number | undefined) ?? ""}
        onChange={(e) =>
          setV({
            ...v,
            [key]:
              type === "number"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value,
          })
        }
        className="input mt-1"
      />
    </label>
  );
  return (
    <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/10 p-5">
      <div className="mb-5">
        <p className="font-mono text-xs uppercase tracking-[.14em] text-primary">cadastro rápido</p>
        <p className="mt-1 text-sm text-white/65">
          Preencha só o que você sabe. O código interno será criado automaticamente se ficar em
          branco.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {f("name", "Nome do produto", "text", "Ex.: Água mineral 500 ml")}
        {f("category", "Categoria", "text", "Ex.: Bebidas")}
        <label className="block text-sm font-semibold text-white/75">
          Preço de venda (R$)
          <input
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            className="input mt-1"
            placeholder="Ex.: 5,00"
          />
        </label>
        {f("stock_quantity", "Quantidade que já chegou", "number", "Ex.: 24")}
        {f("minimum_stock", "Avisar quando chegar em", "number", "Ex.: 5")}
        {f("barcode", "Código de barras (opcional)", "text", "Pode deixar em branco")}
      </div>
      <details className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">
          Opções avançadas
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-white/75">
            Custo de compra (R$)
            <input
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="input mt-1"
              placeholder="Ex.: 2,50"
            />
          </label>
          {f("unit", "Unidade", "text", "un")}
          {f("reorder_point", "Ponto de reposição", "number", "Ex.: 10")}
        </div>
      </details>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() =>
            void onSave({
              ...v,
              sku:
                v.sku ||
                `ARENA-${String(v.name || "PRODUTO")
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-zA-Z0-9]+/g, "-")
                  .toUpperCase()
                  .slice(0, 18)}-${Date.now().toString().slice(-4)}`,
              sale_price_cents: parseReais(salePrice),
              cost_price_cents: parseReais(costPrice),
            })
          }
          className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          Salvar produto
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
function Inventory() {
  const productsQ = useQuery({
    queryKey: ["wms-products"],
    queryFn: () => useServerFn(wmsProducts)(),
  });
  const move = useServerFn(wmsStockMovement);
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("Compra de mercadoria");
  const products = (productsQ.data ?? []) as Product[];
  async function submit(type: "purchase_entry" | "manual_adjustment" | "loss") {
    if (!selected || !reason || qty === 0)
      return toast.error("Escolha o produto, informe uma quantidade e o motivo.");
    try {
      await move({ data: { productId: selected, quantity: qty, movementType: type, reason } });
      toast.success("Movimentação registrada.");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["wms-products"] });
      await qc.invalidateQueries({ queryKey: ["wms-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ajustar.");
    }
  }
  return (
    <section>
      <Title
        eyebrow="controle físico"
        title="Inventário"
        copy="Use esta tela quando uma mercadoria chegar, quebrar ou precisar de correção. Cada ação fica registrada."
      />
      <div className="max-w-xl rounded-2xl border border-white/10 bg-[#211a23] p-5">
        <Field label="Qual produto?">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input">
            <option value="">Escolha um produto…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.stock_quantity} em estoque
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Quantas unidades?">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Por que está alterando?">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: compra do fornecedor, perda, conferência"
              className="input"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => submit("purchase_entry")}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            Entraram mercadorias
          </button>
          <button
            onClick={() => submit("manual_adjustment")}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold"
          >
            Corrigir quantidade
          </button>
          <button
            onClick={() => submit("loss")}
            className="rounded-xl border border-red-300/30 px-4 py-3 text-sm font-bold text-red-200"
          >
            Registrar perda/quebra
          </button>
        </div>
      </div>
    </section>
  );
}
function Audit() {
  const q = useQuery({ queryKey: ["wms-audit"], queryFn: () => useServerFn(wmsAudit)() });
  return (
    <section>
      <Title
        eyebrow="controle e rastreabilidade"
        title="Auditoria"
        copy="Alterações de preços, vendas e movimentos do WMS."
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <DataError onRetry={() => void q.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#211a23]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-white/40">
              <tr>
                <th className="p-4">Data</th>
                <th className="p-4">Ator</th>
                <th className="p-4">Ação</th>
                <th className="p-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {((q.data as any[]) ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap p-4 font-mono text-xs text-white/45">
                    {new Date(row.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-4">{row.actor}</td>
                  <td className="p-4 font-mono text-xs text-primary">{row.action}</td>
                  <td className="max-w-[340px] truncate p-4 text-xs text-white/50">
                    {JSON.stringify(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function Users() {
  const create = useServerFn(wmsCreateUser);
  const [v, setV] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "caixa_local" as "caixa_local" | "admin_remote",
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create({ data: v });
      toast.success("Usuário criado.");
      setV({ username: "", displayName: "", password: "", role: "caixa_local" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar.");
    }
  }
  return (
    <section>
      <Title
        eyebrow="acessos"
        title="Usuários do WMS"
        copy="Crie contas individuais. O Caixa não recebe custos nem margem."
      />
      <form
        onSubmit={submit}
        className="max-w-2xl rounded-2xl border border-white/10 bg-[#211a23] p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Usuário">
            <input
              required
              value={v.username}
              onChange={(e) => setV({ ...v, username: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Nome de exibição">
            <input
              required
              value={v.displayName}
              onChange={(e) => setV({ ...v, displayName: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Senha">
            <input
              required
              minLength={8}
              type="password"
              value={v.password}
              onChange={(e) => setV({ ...v, password: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Perfil">
            <select
              value={v.role}
              onChange={(e) => setV({ ...v, role: e.target.value as Actor["role"] })}
              className="input"
            >
              <option value="caixa_local">Caixa local</option>
              <option value="admin_remote">Admin remoto</option>
            </select>
          </Field>
        </div>
        <button className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
          <UserPlus className="h-4 w-4" />
          Criar conta
        </button>
      </form>
    </section>
  );
}
function Title({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-[.16em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-display text-5xl font-extrabold uppercase leading-[.85]">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-white/55">{copy}</p>
      </div>
      {action}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}
function Loading() {
  return (
    <div className="grid min-h-48 place-items-center text-sm text-white/45">Carregando dados…</div>
  );
}
function DataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-300/30 bg-red-950/20 p-6 text-sm text-red-100">
      <p className="font-bold">Não consegui carregar esta área.</p>
      <p className="mt-1 text-red-100/70">
        A sessão pode ter expirado ou o servidor pode estar ocupado. Tente novamente.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground"
      >
        Tentar novamente
      </button>
    </div>
  );
}
