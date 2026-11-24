import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Copy,
  Check,
  X,
  StickyNote,
  MessageCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  adminCheck,
  adminLogin,
  adminLogout,
  adminDay,
  adminUpdateBooking,
  adminPending,
  adminAudit,
  adminUsers,
  adminSaveUser,
} from "@/lib/arena.functions";
import { TournamentRegistrationsAdmin } from "@/components/TournamentRegistrationsAdmin";
import { ArenaSettingsAdmin } from "@/components/ArenaSettingsAdmin";
import { CurrentBookingsAdmin } from "@/components/CurrentBookingsAdmin";
import { AdminOverview } from "@/components/AdminOverview";
import { AdminDataBackup } from "@/components/AdminDataBackup";
import { MasterPushNotifications } from "@/components/MasterPushNotifications";
import { PhotoGalleryAdmin } from "@/components/PhotoGalleryAdmin";
import {
  ADMIN_MODULES,
  modulesForRole,
  moduleCapabilitiesForRole,
  type AdminModuleId,
  type AdminModuleGroup,
  type AdminRole,
} from "@/lib/admin-navigation";
import { SITE } from "@/lib/site";
import { wmsSaveUser, wmsUsers } from "@/lib/wms.functions";
import {
  arenaNow,
  formatBRL,
  maskPhone,
  PAYMENT_LABEL,
  STATUS_LABEL,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/arena-rules";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Painel — ${SITE.name}` },
      { name: "description", content: `Painel administrativo da ${SITE.name}.` },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Painel — ${SITE.name}` },
      { property: "og:description", content: "Área restrita." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const check = useServerFn(adminCheck);
  const q = useQuery({ queryKey: ["admin-auth"], queryFn: () => check() });
  if (q.isLoading)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  return q.data?.authed && q.data.actor ? <Dashboard actor={q.data.actor} /> : <Login />;
}

function Login() {
  const login = useServerFn(adminLogin);
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div id="vAdm" className="res">
      <header className="rh2">
        <Link className="logo" to="/" aria-label="Arena Leste — início">
          <img
            src="/images/arena-leste-zip-logo.png"
            alt="Arena Leste Multi Sports"
            width="159"
            height="119"
          />
        </Link>
        <Link className="mono" to="/">
          ← Voltar ao site
        </Link>
      </header>
      <main id="conteudo" className="wrap rb">
        <span className="mono">Acesso restrito · Administração</span>
        <h1 className="rt">
          Painel
          <br />
          <b>da Arena</b>
        </h1>
        <form
          className="loginbox f"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = await login({ data: { username, password: pw } }).catch(() => ({
              ok: false,
              error: "Falha de conexão.",
            }));
            setBusy(false);
            if (r.ok) qc.invalidateQueries({ queryKey: ["admin-auth"] });
            else setErr(r.error);
          }}
        >
          <p className="mono">Entre com seu nome de login e senha.</p>
          <label htmlFor="admin-username" className="mono">
            Nome de login
          </label>
          <input
            id="admin-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="login-input"
          />
          <label htmlFor="pw" className="mono">
            Senha
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="login-input"
            aria-describedby={err ? "pw-err" : undefined}
          />
          {err && (
            <p id="pw-err" role="alert" className="booking-error">
              {err}
            </p>
          )}
          <button disabled={busy || !pw || !username} className="btn pri lg">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Entrar
          </button>
        </form>
      </main>
    </div>
  );
}

const STATUS_BADGE: Record<PaymentStatus, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};
const shift = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

function formatAdminWeekday(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function formatAdminTimeRange(range: string) {
  return range.replace("24:00", "00:00");
}

const ADMIN_NAV_GROUPS: AdminModuleGroup[] = [
  "Comece aqui",
  "Operação diária",
  "Arena e conteúdo",
  "Administração",
];

function Dashboard({
  actor,
}: {
  actor: { id: string; username: string; name: string; role: AdminRole };
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => arenaNow().date);
  const [search, setSearch] = useState("");
  const [space, setSpace] = useState("all");
  const [status, setStatus] = useState("all");
  const [reveal, setReveal] = useState<string | null>(null);
  const allowedModules = modulesForRole(actor.role);
  const [activeModule, setActiveModule] = useState<AdminModuleId>(
    allowedModules[0]?.id ?? "overview",
  );
  const activeModuleId = allowedModules.some((module) => module.id === activeModule)
    ? activeModule
    : (allowedModules[0]?.id ?? "overview");
  const activeModuleInfo = allowedModules.find((module) => module.id === activeModuleId);
  const navigateToModule = (moduleId: AdminModuleId) => {
    if (allowedModules.some((module) => module.id === moduleId)) setActiveModule(moduleId);
  };
  const fetchDay = useServerFn(adminDay);
  const update = useServerFn(adminUpdateBooking);
  const logout = useServerFn(adminLogout);
  const day = useQuery({
    queryKey: ["admin-day", date],
    queryFn: () => fetchDay({ data: { date } }),
    retry: false,
    enabled: activeModuleId === "legacy",
  });

  const rows = useMemo(
    () =>
      (day.data?.bookings ?? []).filter(
        (b) =>
          (space === "all" || b.space_id === space) &&
          (status === "all" || b.payment_status === status) &&
          (!search ||
            b.customer_name.toLowerCase().includes(search.toLowerCase()) ||
            (b.group_code ?? b.booking_code).includes(search.toUpperCase())),
      ),
    [day.data, search, space, status],
  );

  const all = useMemo(() => day.data?.bookings ?? [], [day.data?.bookings]);
  const groups = useMemo(() => {
    const m = new Map<string, { total: number; times: string[]; ranges: string[] }>();
    for (const b of all) {
      if (b.payment_status === "cancelled") continue;
      const g = b.group_code ?? b.booking_code;
      const e = m.get(g) ?? { total: 0, times: [], ranges: [] };
      e.total += b.amount_cents;
      e.times.push(b.start_time.slice(0, 5));
      e.ranges.push(`${b.start_time.slice(0, 5)} – ${b.end_time.slice(0, 5)}`);
      m.set(g, e);
    }
    for (const e of m.values()) e.times.sort();
    return m;
  }, [all]);
  const active = all.filter((b) => b.payment_status === "pending" || b.payment_status === "paid");
  const revenue = all
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + b.amount_cents, 0);
  const pending = all.filter((b) => b.payment_status === "pending").length;
  const capacity = (day.data?.slotsPerSpace ?? 0) * (day.data?.spaces.length ?? 0);
  const occupancy = capacity ? `${Math.round((active.length / capacity) * 100)}%` : "—";
  const now = arenaNow();
  const next = active.find(
    (b) =>
      date > now.date ||
      (date === now.date &&
        b.start_time.slice(0, 5) >= `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:00`),
  );
  const spaceName = (id: string) => day.data?.spaces.find((s) => s.id === id)?.name ?? id;

  async function act(id: string, action: "mark_paid" | "cancel" | "note", note?: string) {
    if (action === "cancel" && !confirm("Cancelar esta reserva?")) return;
    if (
      action === "mark_paid" &&
      !confirm("Confirmar como paga? Todos os horários do mesmo código serão confirmados.")
    )
      return;
    const r = await update({ data: { id, action, note } });
    if (r.ok) {
      toast.success(action === "mark_paid" ? "Reserva confirmada" : "Atualizado");
      qc.invalidateQueries({ queryKey: ["admin-day"] });
      qc.invalidateQueries({ queryKey: ["admin-pending"] });
    } else toast.error(r.error);
  }
  useEffect(() => {
    if (day.error instanceof Error && day.error.message === "UNAUTHORIZED") {
      void qc.invalidateQueries({ queryKey: ["admin-auth"] });
    }
  }, [day.error, qc]);

  return (
    <div id="vAdm" className="adm">
      <aside className="sb">
        <Link className="logo" to="/" aria-label="Voltar ao site da Arena Leste">
          <img
            src="/images/arena-leste-zip-logo.png"
            alt="Arena Leste Multi Sports"
            width="159"
            height="119"
          />
        </Link>
        <p className="mono">Painel administrativo</p>
        <nav id="sbn" aria-label="Módulos administrativos">
          {ADMIN_NAV_GROUPS.map((group) => {
            const modules = allowedModules.filter((module) => module.group === group);
            if (!modules.length) return null;
            return (
              <div className="admin-nav-group" key={group}>
                <span className="admin-nav-group-label">{group}</span>
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      className="sbi"
                      aria-current={activeModuleId === module.id ? "page" : undefined}
                      aria-controls="admin-module-content"
                      onClick={() => navigateToModule(module.id)}
                    >
                      <i aria-hidden="true">
                        <Icon size={18} />
                      </i>
                      <span>{module.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="admin-mobile-navigation">
          <label htmlFor="admin-area-select">Ir para uma área</label>
          <select
            id="admin-area-select"
            value={activeModuleId}
            onChange={(event) => {
              const selected = allowedModules.find((module) => module.id === event.target.value);
              if (selected) navigateToModule(selected.id);
            }}
            aria-controls="admin-module-content"
          >
            {ADMIN_NAV_GROUPS.map((group) => {
              const modules = allowedModules.filter((module) => module.group === group);
              return modules.length ? (
                <optgroup key={group} label={group}>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <span>
            {allowedModules.length}{" "}
            {allowedModules.length === 1 ? "área disponível" : "áreas disponíveis"} no seu perfil
          </span>
        </div>
        <Link className="btn" to="/">
          ← Ver site
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            qc.invalidateQueries({ queryKey: ["admin-auth"] });
          }}
          className="btn sbx"
        >
          <LogOut size={16} /> Sair do painel
        </button>
      </aside>
      <main id="conteudo" className="am">
        <div className="admin-topbar flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="mono block">Arena Leste · Operação online</span>
            <span className="admin-current-module block truncate font-display text-xl font-bold uppercase">
              {activeModuleInfo?.label ?? "Painel"}
            </span>
          </div>
          <span className="mono text-primary">
            {actor.name} ·{" "}
            {actor.role === "master" ? "Admin Master" : actor.role === "caixa" ? "Caixa" : "Mídia"}
          </span>
        </div>
        {actor.role === "master" && <MasterPushNotifications adminId={actor.id} />}
        <div id="admin-module-content" className="swap">
          {activeModuleInfo && activeModuleId !== "overview" && (
            <section
              className="admin-module-guide"
              aria-label={`Orientação: ${activeModuleInfo.label}`}
            >
              <div className="admin-module-guide-intro">
                <p className="admin-guide-eyebrow">
                  {activeModuleInfo.group} · O que você pode fazer
                </p>
                <p className="admin-guide-description">{activeModuleInfo.description}</p>
                <p className="admin-guide-first-step">
                  <strong>Para começar:</strong> {activeModuleInfo.firstStep}
                </p>
              </div>
              <ul className="admin-guide-actions" aria-label="Ações disponíveis nesta área">
                {moduleCapabilitiesForRole(activeModuleInfo, actor.role).map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </section>
          )}
          {activeModuleId === "overview" && (
            <AdminOverview
              allowedModules={allowedModules.map((module) => module.id)}
              role={actor.role}
              onNavigate={navigateToModule}
            />
          )}
          {activeModuleId === "agenda" && <CurrentBookingsAdmin view="agenda" />}
          {activeModuleId === "reservations" && (
            <CurrentBookingsAdmin view="reservations" isMaster={actor.role === "master"} />
          )}
          {activeModuleId === "courts" && (
            <ArenaSettingsAdmin initialTab="courts" showTabs={false} />
          )}
          {activeModuleId === "hours" && <ArenaSettingsAdmin initialTab="hours" showTabs={false} />}
          {activeModuleId === "gallery" && <PhotoGalleryAdmin />}
          {activeModuleId === "tournament" && <TournamentRegistrationsAdmin />}
          {activeModuleId === "backup" && <AdminDataBackup />}
          {activeModuleId === "audit" && <AdminAudit />}
          {activeModuleId === "users" && <AdminUsers />}
          {activeModuleId === "contact" && (
            <section aria-labelledby="admin-contact-heading">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
                Canais publicados
              </p>
              <h2
                id="admin-contact-heading"
                className="mt-2 font-display text-4xl font-extrabold uppercase"
              >
                Contato oficial
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Referências oficiais usadas no site. A edição direta está desativada para evitar a
                publicação de um endereço ou contato não confirmado.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <article className="border-l-2 border-primary pl-4 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    WhatsApp
                  </p>
                  <a
                    className="mt-1 inline-block font-semibold text-primary hover:underline"
                    href={`https://wa.me/${SITE.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {SITE.phoneDisplay}
                  </a>
                </article>
                <article className="border-l-2 border-primary pl-4 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Instagram
                  </p>
                  <a
                    className="mt-1 inline-block font-semibold text-primary hover:underline"
                    href={SITE.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @arenalesteoficial
                  </a>
                </article>
                {SITE.units.map((unit, index) => (
                  <article key={unit.id} className="border-l-2 border-border pl-4 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Unidade {index + 1}
                    </p>
                    <p className="mt-1 font-semibold">{unit.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{unit.address}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
          {activeModuleId === "legacy" && (
            <section
              className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5"
              aria-labelledby="legacy-heading"
            >
              <h2 id="legacy-heading" className="font-display text-2xl font-bold uppercase">
                Arquivo de reservas da Arena Elsinho
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Os registros abaixo pertencem ao fluxo de reservas anterior à Arena Leste. Eles não
                informam disponibilidade atual, não criam agendamentos para as novas unidades e não
                devem ser tratados como confirmação sem validar com a equipe.
              </p>
              <div className="mt-6">
                <PendingList
                  onConfirm={(id) => act(id, "mark_paid")}
                  onCancel={(id) => act(id, "cancel")}
                  onOpen={setDate}
                />

                <div className="mt-8 flex items-center gap-2">
                  <button
                    aria-label="Dia anterior"
                    onClick={() => setDate(shift(date, -1))}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-border"
                  >
                    <ChevronLeft />
                  </button>
                  <input
                    type="date"
                    aria-label="Data"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className="h-11 rounded-lg border border-input bg-card px-3"
                  />
                  <button
                    aria-label="Próximo dia"
                    onClick={() => setDate(shift(date, 1))}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-border"
                  >
                    <ChevronRight />
                  </button>
                  <button
                    onClick={() => setDate(arenaNow().date)}
                    className="h-11 rounded-lg border border-border px-4 text-sm"
                  >
                    Hoje
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                  {[
                    ["Receita confirmada", formatBRL(revenue)],
                    ["Reservas do dia", String(active.length)],
                    ["Pagamentos pendentes", String(pending)],
                    ["Ocupação histórica", occupancy],
                    [
                      "Próximo horário",
                      next
                        ? `${next.start_time.slice(0, 5)} · ${next.customer_name.split(" ")[0]}`
                        : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-2xl border border-border bg-card p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
                      <p className="mt-1 font-display text-2xl font-bold">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <input
                    placeholder="Buscar cliente ou código"
                    aria-label="Buscar"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 min-w-56 flex-1 rounded-lg border border-input bg-card px-3"
                  />
                  <select
                    aria-label="Espaço"
                    value={space}
                    onChange={(e) => setSpace(e.target.value)}
                    className="h-11 rounded-lg border border-input bg-card px-3"
                  >
                    <option value="all">Todos os espaços</option>
                    {day.data?.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="h-11 rounded-lg border border-input bg-card px-3"
                  >
                    <option value="all">Todos os status</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {day.error ? (
                  <div
                    className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center"
                    role="alert"
                  >
                    <p className="text-muted-foreground">
                      Não foi possível carregar o histórico agora. Confira sua conexão e tente
                      novamente.
                    </p>
                    <button
                      type="button"
                      className="mt-4 h-11 rounded-lg border border-border px-4 font-semibold"
                      onClick={() => void day.refetch()}
                      disabled={day.isFetching}
                    >
                      {day.isFetching ? "Tentando novamente…" : "Tentar novamente"}
                    </button>
                  </div>
                ) : day.isLoading ? (
                  <p className="mt-10 flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando…
                  </p>
                ) : rows.length === 0 ? (
                  <p className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                    Nenhuma reserva para este filtro.
                  </p>
                ) : (
                  <div className="mt-6 space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border">
                    <div className="hidden grid-cols-[90px_1.4fr_150px_1.3fr_130px_110px_auto] gap-3 bg-card px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground lg:grid">
                      <span>Horário</span>
                      <span>Cliente</span>
                      <span>WhatsApp</span>
                      <span>Espaço</span>
                      <span>Pagamento</span>
                      <span>Status</span>
                      <span>Ações</span>
                    </div>
                    {rows.map((b) => {
                      const st = b.payment_status as PaymentStatus;
                      const shown = reveal === b.id;
                      const g = groups.get(b.group_code ?? b.booking_code);
                      const code = b.group_code ?? b.booking_code;
                      return (
                        <div
                          key={b.id}
                          className="grid gap-2 rounded-2xl border border-border bg-card p-4 lg:grid-cols-[90px_1.4fr_150px_1.3fr_130px_110px_auto] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent"
                        >
                          <span className="font-display text-xl font-bold">
                            {b.start_time.slice(0, 5)}
                          </span>
                          <div>
                            <p className="font-medium">{b.customer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {code}
                              {g && g.times.length > 1
                                ? ` · ${g.times.length} horários (${g.times.join(", ")})`
                                : ""}
                              {b.notes ? ` · ${b.notes}` : ""}
                            </p>
                          </div>
                          <span className="flex items-center gap-1 text-sm">
                            {shown ? b.phone : maskPhone(b.phone)}
                            <button
                              aria-label={shown ? "Ocultar telefone" : "Mostrar telefone"}
                              onClick={() => setReveal(shown ? null : b.id)}
                              className="p-1"
                            >
                              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </span>
                          <span className="text-sm">{spaceName(b.space_id)}</span>
                          <span className="text-sm">
                            {PAYMENT_LABEL[b.payment_method as PaymentMethod]}
                          </span>
                          <span
                            className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[st]}`}
                          >
                            {STATUS_LABEL[st]}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {st === "pending" && (
                              <IconBtn
                                label="Confirmar reserva"
                                onClick={() => act(b.id, "mark_paid")}
                              >
                                <Check className="h-4 w-4 text-success" />
                              </IconBtn>
                            )}
                            <IconBtn
                              label="Copiar WhatsApp"
                              onClick={() => {
                                navigator.clipboard.writeText(b.phone);
                                toast.success("Copiado");
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </IconBtn>
                            <a
                              aria-label="Enviar confirmação"
                              title="Enviar confirmação"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-10 w-10 place-items-center rounded-lg border border-border hover:bg-accent"
                              href={`https://wa.me/55${b.phone}?text=${encodeURIComponent(`Olá, ${b.customer_name.split(" ")[0]}, sobre a sua reserva na Arena Leste, ${formatAdminWeekday(b.booking_date)}, dia ${b.booking_date.split("-").reverse().join("/")}, das ${(g?.ranges ?? [`${b.start_time.slice(0, 5)} – ${b.end_time.slice(0, 5)}`]).map(formatAdminTimeRange).join(" e ")}.`)}`}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                            <IconBtn
                              label="Registrar observação"
                              onClick={() => {
                                const n = prompt("Observação", b.notes ?? "");
                                if (n !== null) act(b.id, "note", n);
                              }}
                            >
                              <StickyNote className="h-4 w-4" />
                            </IconBtn>
                            {(st === "pending" || st === "paid") && (
                              <IconBtn label="Cancelar reserva" onClick={() => act(b.id, "cancel")}>
                                <X className="h-4 w-4 text-destructive" />
                              </IconBtn>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function auditAction(action: string) {
  const labels: Record<string, string> = {
    "admin.login": "Entrou no painel",
    "admin.login_failed": "Tentativa de entrada recusada",
    "admin.user.create": "Criou um acesso",
    "admin.user.update": "Alterou um acesso",
    "arena.space.create": "Cadastrou uma quadra",
    "arena.space.update": "Alterou uma quadra",
    "arena.hours.update": "Alterou os horários",
    "gallery.photo.upload": "Adicionou uma foto",
    "gallery.photo.update": "Alterou uma foto",
    "gallery.photo.move": "Moveu uma foto",
    "gallery.photo.delete": "Excluiu uma foto",
    "booking.create": "Criou uma reserva",
    "booking.update": "Alterou uma reserva",
    "booking.cancel": "Cancelou uma reserva",
    "wms.product.save": "Cadastrou ou alterou um produto",
    "wms.sale.create": "Registrou uma venda",
    "wms.stock.movement": "Alterou o estoque",
    "wms.user.create": "Criou um acesso do PDV",
    "wms.user.update": "Alterou um acesso do PDV",
    "wms.login": "Entrou no PDV",
  };
  return labels[action] ?? action.replace(/[._]/g, " ");
}

function auditPlace(row: { entity: string | null; action: string }) {
  if (row.action.startsWith("wms.")) return "Estoque / PDV";
  if (row.action.startsWith("gallery.")) return "Galeria de fotos";
  if (row.action.startsWith("booking.")) return "Reservas";
  if (row.action.startsWith("arena.")) return "Configurações da arena";
  if (row.action.startsWith("admin.user.")) return "Usuários e acessos";
  return row.entity ?? "Sistema";
}

function auditDetails(details: Record<string, unknown> | null) {
  if (!details) return "Nenhum detalhe adicional.";
  const entries = Object.entries(details).filter(
    ([key]) => key !== "role" && key !== "passwordChanged",
  );
  if (!entries.length) return "Ação registrada no sistema.";
  const labels: Record<string, string> = {
    username: "login",
    displayName: "nome",
    role: "perfil",
    active: "acesso ativo",
    sku: "SKU",
    total: "total",
    newStock: "novo estoque",
    reason: "motivo",
    slots: "quantidade de horários",
  };
  return entries
    .map(
      ([key, value]) =>
        `${labels[key] ?? key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
    )
    .join(" · ");
}

function AdminAudit() {
  const fetchAudit = useServerFn(adminAudit);
  const [draftFilters, setDraftFilters] = useState({ dateFrom: "", dateTo: "", actionType: "all" });
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", actionType: "all" });
  const query = useQuery({
    queryKey: ["admin-audit", filters],
    queryFn: () => fetchAudit({ data: filters }),
    retry: false,
  });
  const rows = (query.data ?? []) as Array<{
    id: string;
    actor: string;
    action: string;
    entity: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }>;
  return (
    <section aria-labelledby="admin-audit-heading">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
        controle Master
      </p>
      <h2 id="admin-audit-heading" className="mt-2 font-display text-4xl font-extrabold uppercase">
        Alterações feitas
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Registro de inclusões, alterações, exclusões e acessos feitos por qualquer perfil.
      </p>
      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card/60 p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <label className="text-sm font-semibold">
          De
          <input
            type="date"
            className="login-input mt-1"
            value={draftFilters.dateFrom}
            onChange={(e) => setDraftFilters({ ...draftFilters, dateFrom: e.target.value })}
          />
        </label>
        <label className="text-sm font-semibold">
          Até
          <input
            type="date"
            className="login-input mt-1"
            value={draftFilters.dateTo}
            onChange={(e) => setDraftFilters({ ...draftFilters, dateTo: e.target.value })}
          />
        </label>
        <label className="text-sm font-semibold">
          Tipo de alteração
          <select
            className="login-input mt-1"
            value={draftFilters.actionType}
            onChange={(e) => setDraftFilters({ ...draftFilters, actionType: e.target.value })}
          >
            <option value="all">Todas</option>
            <option value="booking">Reservas</option>
            <option value="schedule">Horários e quadras</option>
            <option value="gallery">Fotos</option>
            <option value="stock">Estoque e PDV</option>
            <option value="users">Usuários e acessos</option>
            <option value="login">Entradas no sistema</option>
          </select>
        </label>
        <div className="flex flex-col gap-2 sm:col-span-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const empty = { dateFrom: "", dateTo: "", actionType: "all" };
              setDraftFilters(empty);
              setFilters(empty);
            }}
          >
            Mostrar tudo
          </button>
          <button type="button" className="btn pri" onClick={() => setFilters(draftFilters)}>
            Filtrar alterações
          </button>
        </div>
      </div>
      {query.error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>Não foi possível carregar as alterações. Confira a conexão e tente novamente.</p>
          <button
            type="button"
            className="mt-3 min-h-10 rounded-lg border border-border px-3 font-semibold"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Tentando novamente…" : "Tentar novamente"}
          </button>
        </div>
      )}
      <div className="admin-desktop-list mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-4">Usuário</th>
              <th className="p-4">Data e hora</th>
              <th className="p-4">Onde</th>
              <th className="p-4">O que aconteceu</th>
              <th className="p-4">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="p-4 font-semibold">{row.actor}</td>
                <td className="p-4 whitespace-nowrap text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="p-4">{auditPlace(row)}</td>
                <td className="p-4 font-semibold text-primary">{auditAction(row.action)}</td>
                <td className="max-w-[360px] p-4 text-xs text-muted-foreground">
                  {auditDetails(row.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!query.isLoading && rows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma alteração registrada.
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:hidden">
        {query.isLoading ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Carregando alterações…
          </p>
        ) : rows.length === 0 && !query.error ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Nenhuma alteração registrada para estes filtros.
          </p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{row.actor}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  {auditPlace(row)}
                </span>
              </div>
              <p className="mt-3 font-semibold">{auditAction(row.action)}</p>
              <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                {auditDetails(row.details)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

type AdminUserRecord = {
  id: string;
  username: string;
  display_name: string;
  role: "master" | "caixa" | "midia";
  active: boolean;
};
type AdminUserDraft = {
  id?: string;
  username: string;
  displayName: string;
  role: AdminUserRecord["role"];
  password: string;
  active: boolean;
};
type WmsUserRecord = {
  id: string;
  username: string;
  display_name: string;
  role: "admin_remote" | "caixa_local";
  active: boolean;
};
type WmsUserDraft = {
  id?: string;
  username: string;
  displayName: string;
  password: string;
  role: WmsUserRecord["role"];
  active: boolean;
  permissions: string[];
};

function AdminUsers() {
  const fetchUsers = useServerFn(adminUsers);
  const saveUser = useServerFn(adminSaveUser);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers(), retry: false });
  const fetchWmsUsers = useServerFn(wmsUsers);
  const saveWmsUser = useServerFn(wmsSaveUser);
  const wmsQuery = useQuery({
    queryKey: ["admin-wms-users"],
    queryFn: () => fetchWmsUsers(),
    retry: false,
  });
  const [editing, setEditing] = useState<AdminUserDraft | null>(null);
  const [editingWms, setEditingWms] = useState<WmsUserDraft | null>(null);
  const users = (query.data ?? []) as AdminUserRecord[];
  async function save() {
    if (!editing) return;
    try {
      await saveUser({ data: editing });
      toast.success("Acesso salvo.");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o acesso.");
    }
  }
  return (
    <section aria-labelledby="admin-users-heading">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
            controle Master
          </p>
          <h2
            id="admin-users-heading"
            className="mt-2 font-display text-4xl font-extrabold uppercase"
          >
            Gerenciar acessos
          </h2>
        </div>
        <button
          type="button"
          className="btn pri"
          onClick={() =>
            setEditing({ username: "", displayName: "", role: "caixa", password: "", active: true })
          }
        >
          Novo acesso
        </button>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Cadastre até quatro Caixas, dois usuários de Mídia e um Admin Master. O Master pode trocar
        nome de login, senha e status.
      </p>
      {editing && (
        <div className="mt-6 grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:grid-cols-2">
          <label className="text-sm">
            Nome de login
            <input
              className="login-input mt-1"
              value={editing.username}
              onChange={(e) => setEditing({ ...editing, username: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Nome de exibição
            <input
              className="login-input mt-1"
              value={editing.displayName}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Perfil
            <select
              className="login-input mt-1"
              value={editing.role}
              onChange={(e) =>
                setEditing({ ...editing, role: e.target.value as AdminUserDraft["role"] })
              }
            >
              <option value="caixa">Caixa</option>
              <option value="midia">Mídia</option>
              <option value="master">Admin Master</option>
            </select>
          </label>
          <label className="text-sm">
            Senha {editing.id ? "(opcional para manter)" : "inicial"}
            <input
              className="login-input mt-1"
              type="password"
              value={editing.password ?? ""}
              onChange={(e) => setEditing({ ...editing, password: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
            />{" "}
            Acesso ativo
          </label>
          <div className="flex gap-2 sm:justify-end">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="button" className="btn pri" onClick={save}>
              Salvar acesso
            </button>
          </div>
        </div>
      )}
      <div className="admin-desktop-list mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-4">Login</th>
              <th className="p-4">Nome</th>
              <th className="p-4">Perfil</th>
              <th className="p-4">Status</th>
              <th className="p-4">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="p-4 font-mono">{user.username}</td>
                <td className="p-4">{user.display_name}</td>
                <td className="p-4">
                  {user.role === "master"
                    ? "Admin Master"
                    : user.role === "caixa"
                      ? "Caixa"
                      : "Mídia"}
                </td>
                <td className="p-4">{user.active ? "Ativo" : "Inativo"}</td>
                <td className="p-4">
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() =>
                      setEditing({
                        id: user.id,
                        username: user.username,
                        displayName: user.display_name,
                        role: user.role,
                        password: "",
                        active: user.active,
                      })
                    }
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:hidden">
        {query.isLoading ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Carregando acessos…
          </p>
        ) : users.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Nenhum acesso cadastrado.
          </p>
        ) : (
          users.map((user) => (
            <article key={user.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold">{user.username}</p>
                  <p className="mt-1 break-words">{user.display_name}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${user.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {user.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">
                  {user.role === "master"
                    ? "Admin Master"
                    : user.role === "caixa"
                      ? "Caixa"
                      : "Mídia"}
                </span>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-primary"
                  onClick={() =>
                    setEditing({
                      id: user.id,
                      username: user.username,
                      displayName: user.display_name,
                      role: user.role,
                      password: "",
                      active: user.active,
                    })
                  }
                >
                  Editar acesso
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="mt-10 border-t border-border pt-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
          acessos separados
        </p>
        <h3 className="mt-2 font-display text-3xl font-extrabold uppercase">Logins do WMS / PDV</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Altere o login, nome, senha ou status de quem entra no estoque e no caixa. A senha nunca
          aparece na tela.
        </p>
        <button
          type="button"
          className="btn pri mt-4"
          onClick={() =>
            setEditingWms({
              username: "",
              displayName: "",
              password: "",
              role: "caixa_local",
              active: true,
              permissions: ["balcao"],
            })
          }
        >
          Novo acesso WMS
        </button>
        {editingWms && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:grid-cols-2">
            <label className="text-sm">
              Login
              <input
                className="login-input mt-1"
                value={editingWms.username}
                onChange={(e) => setEditingWms({ ...editingWms, username: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Nome
              <input
                className="login-input mt-1"
                value={editingWms.displayName}
                onChange={(e) => setEditingWms({ ...editingWms, displayName: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Nova senha {editingWms.id ? "(opcional)" : ""}
              <input
                className="login-input mt-1"
                type="password"
                value={editingWms.password}
                onChange={(e) => setEditingWms({ ...editingWms, password: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Perfil
              <select
                className="login-input mt-1"
                value={editingWms.role}
                onChange={(e) =>
                  setEditingWms({ ...editingWms, role: e.target.value as WmsUserDraft["role"] })
                }
              >
                <option value="caixa_local">Caixa local</option>
                <option value="admin_remote">Admin remoto</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editingWms.active}
                onChange={(e) => setEditingWms({ ...editingWms, active: e.target.checked })}
              />{" "}
              Acesso ativo
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold">Abas liberadas no WMS / PDV</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {[
                  ["dashboard", "Visão geral"],
                  ["balcao", "Balcão / PDV"],
                  ["catalogo", "Catálogo"],
                  ["estoque", "Inventário"],
                  ["auditoria", "Auditoria"],
                  ["usuarios", "Usuários"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={(editingWms.permissions ?? []).includes(key)}
                      onChange={(e) =>
                        setEditingWms({
                          ...editingWms,
                          permissions: e.target.checked
                            ? [...(editingWms.permissions ?? []), key]
                            : (editingWms.permissions ?? []).filter((item) => item !== key),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2 sm:justify-end">
              <button type="button" className="btn" onClick={() => setEditingWms(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn pri"
                onClick={async () => {
                  try {
                    await saveWmsUser({
                      data: { ...editingWms, password: editingWms.password || undefined },
                    });
                    toast.success("Acesso WMS salvo.");
                    setEditingWms(null);
                    await wmsQuery.refetch();
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Não foi possível salvar o acesso WMS.",
                    );
                  }
                }}
              >
                Salvar acesso
              </button>
            </div>
          </div>
        )}
        <div className="admin-desktop-list mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4">Login</th>
                <th className="p-4">Nome</th>
                <th className="p-4">Perfil</th>
                <th className="p-4">Status</th>
                <th className="p-4">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {((wmsQuery.data as WmsUserRecord[]) ?? []).map((user) => (
                <tr key={user.id}>
                  <td className="p-4 font-mono">{user.username}</td>
                  <td className="p-4">{user.display_name}</td>
                  <td className="p-4">
                    {user.role === "admin_remote" ? "Admin remoto" : "Caixa local"}
                  </td>
                  <td className="p-4">{user.active ? "Ativo" : "Inativo"}</td>
                  <td className="p-4">
                    <button
                      type="button"
                      className="font-semibold text-primary"
                      onClick={() =>
                        setEditingWms({
                          id: user.id,
                          username: user.username,
                          displayName: user.display_name,
                          password: "",
                          role: user.role,
                          active: user.active,
                        })
                      }
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:hidden">
          {wmsQuery.isLoading ? (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              Carregando acessos do PDV…
            </p>
          ) : ((wmsQuery.data as WmsUserRecord[]) ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Nenhum acesso WMS cadastrado.
            </p>
          ) : (
            ((wmsQuery.data as WmsUserRecord[]) ?? []).map((user) => (
              <article key={user.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm font-semibold">{user.username}</p>
                    <p className="mt-1 break-words">{user.display_name}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${user.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {user.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">
                    {user.role === "admin_remote" ? "Admin remoto" : "Caixa local"}
                  </span>
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-primary"
                    onClick={() =>
                      setEditingWms({
                        id: user.id,
                        username: user.username,
                        displayName: user.display_name,
                        password: "",
                        role: user.role,
                        active: user.active,
                      })
                    }
                  >
                    Editar acesso
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-lg border border-border hover:bg-accent"
    >
      {children}
    </button>
  );
}

function PendingList({
  onConfirm,
  onCancel,
  onOpen,
}: {
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (date: string) => void;
}) {
  const fetchPending = useServerFn(adminPending);
  const q = useQuery({
    queryKey: ["admin-pending"],
    queryFn: () => fetchPending(),
    retry: false,
    refetchInterval: 30000,
  });
  const list = q.data ?? [];
  return (
    <section className="mt-6 rounded-2xl border border-warning/40 bg-warning/5 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold uppercase">
        Pendências do arquivo antigo{" "}
        <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-sm text-warning">
          {list.length}
        </span>
      </h2>
      {q.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma reserva aguardando confirmação.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <button onClick={() => onOpen(b.booking_date)} className="min-w-0 flex-1 text-left">
                <p className="font-medium">
                  {b.booking_date.split("-").reverse().join("/")} · {b.start_time.slice(0, 5)} —{" "}
                  {b.customer_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.space_name} · {PAYMENT_LABEL[b.payment_method as PaymentMethod]} ·{" "}
                  {formatBRL(b.amount_cents)} · {b.booking_code}
                </p>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirm(b.id)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  <Check className="h-4 w-4" />
                  Confirmar
                </button>
                <IconBtn label="Cancelar reserva" onClick={() => onCancel(b.id)}>
                  <X className="h-4 w-4 text-destructive" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
