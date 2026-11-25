import type { CSSProperties } from "react";
import {
  ADMIN_RESERVATION_STATUSES,
  type AdminDashboardDailyPoint,
  type AdminDashboardStatusPoint,
  type AdminReservationStatus,
} from "@/lib/admin-dashboard";

type AdminAnalyticsProps = {
  weekly: AdminDashboardDailyPoint[];
  todayStatuses: AdminDashboardStatusPoint[];
};

const STATUS_DETAILS: Record<AdminReservationStatus, { label: string; color: string }> = {
  paid: { label: "Pagamento confirmado", color: "var(--admin-paid)" },
  manual: { label: "Bloqueio manual", color: "var(--ac)" },
  pending: { label: "Checkout pendente · não bloqueia", color: "var(--admin-pending)" },
  review: { label: "Pagamento para revisão · não bloqueia", color: "var(--admin-review)" },
  cancelled: { label: "Canceladas", color: "var(--admin-muted)" },
  expired: { label: "Expiradas", color: "var(--admin-muted-2)" },
  failed: { label: "Falha de pagamento", color: "var(--admin-failed)" },
};

const DAILY_SERIES: Array<{
  key: keyof Pick<AdminDashboardDailyPoint, "paid" | "manual" | "pending" | "review">;
  label: string;
  color: string;
}> = [
  { key: "paid", label: "Pagamento confirmado", color: "var(--admin-paid)" },
  { key: "manual", label: "Bloqueio manual", color: "var(--ac)" },
  { key: "pending", label: "Checkout pendente", color: "var(--admin-pending)" },
  { key: "review", label: "Pagamento para revisão", color: "var(--admin-review)" },
];

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(`${iso}T12:00:00Z`))
    .replace(".", "");
}

function makeDonutGradient(points: AdminDashboardStatusPoint[]) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (!total) return "conic-gradient(var(--bd) 0deg 360deg)";
  let cursor = 0;
  const stops = points
    .filter((point) => point.count > 0)
    .map((point) => {
      const start = cursor;
      cursor += (point.count / total) * 360;
      return `${STATUS_DETAILS[point.status].color} ${start}deg ${cursor}deg`;
    });
  return `conic-gradient(${stops.join(", ")})`;
}

export function AdminAnalytics({ weekly, todayStatuses }: AdminAnalyticsProps) {
  const maximumDay = Math.max(
    1,
    ...weekly.map((point) => point.paid + point.manual + point.pending + point.review),
  );
  const totalToday = todayStatuses.reduce((sum, point) => sum + point.count, 0);
  const donutStyle = { background: makeDonutGradient(todayStatuses) } satisfies CSSProperties;

  return (
    <section className="admin-analytics" aria-label="Gráficos de reservas">
      <article className="admin-chart-card">
        <header className="admin-chart-heading">
          <div>
            <p className="admin-chart-eyebrow">Últimos 7 dias</p>
            <h3>Reservas por dia de uso</h3>
          </div>
          <span aria-hidden="true" className="admin-chart-mark">
            7D
          </span>
        </header>
        <p className="admin-chart-caption">
          Cada coluna conta grupos de reserva por data escolhida. O total não representa visitas ou
          receita.
        </p>
        <div
          className="admin-bar-chart"
          role="img"
          aria-label="Reservas por data, nos últimos sete dias"
        >
          {weekly.map((point) => {
            const sum = point.paid + point.manual + point.pending + point.review;
            return (
              <div
                className="admin-bar-day"
                key={point.date}
                title={`${point.date}: ${sum} reservas`}
              >
                <div className="admin-bar-track">
                  {DAILY_SERIES.map((series) => {
                    const value = point[series.key];
                    return (
                      <span
                        key={series.key}
                        className="admin-bar-segment"
                        style={{
                          height: `${(value / maximumDay) * 100}%`,
                          backgroundColor: series.color,
                        }}
                        title={`${series.label}: ${value}`}
                      />
                    );
                  })}
                  {sum === 0 && <span className="admin-bar-zero" />}
                </div>
                <time dateTime={point.date}>{formatDay(point.date)}</time>
                <span className="admin-bar-total">{sum}</span>
              </div>
            );
          })}
        </div>
        <ul className="admin-chart-legend" aria-label="Legenda das reservas por dia">
          {DAILY_SERIES.map((series) => (
            <li key={series.key}>
              <span style={{ backgroundColor: series.color }} aria-hidden="true" />
              {series.label}
            </li>
          ))}
        </ul>
        <ul className="sr-only">
          {weekly.map((point) => (
            <li key={point.date}>
              {point.date}: {point.paid} pagamentos confirmados, {point.manual} bloqueios manuais,{" "}
              {point.pending} checkouts pendentes e {point.review} pagamentos para revisão.
            </li>
          ))}
        </ul>
      </article>

      <article className="admin-chart-card">
        <header className="admin-chart-heading">
          <div>
            <p className="admin-chart-eyebrow">Hoje</p>
            <h3>Situação das reservas</h3>
          </div>
          <span aria-hidden="true" className="admin-chart-mark">
            {String(totalToday).padStart(2, "0")}
          </span>
        </header>
        <p className="admin-chart-caption">
          Somente pagamento verificado ou bloqueio manual ocupa a quadra. Pendências e revisões não
          bloqueiam.
        </p>
        <div className="admin-donut-layout">
          <div className="admin-donut" style={donutStyle} aria-hidden="true">
            <div>
              <strong>{totalToday}</strong>
              <span>reservas</span>
            </div>
          </div>
          <ul className="admin-status-legend">
            {ADMIN_RESERVATION_STATUSES.map((status) => {
              const point = todayStatuses.find((item) => item.status === status);
              return (
                <li key={status}>
                  <span
                    className="admin-status-swatch"
                    style={{ backgroundColor: STATUS_DETAILS[status].color }}
                    aria-hidden="true"
                  />
                  <span className="admin-status-name">{STATUS_DETAILS[status].label}</span>
                  <strong>{point?.count ?? 0}</strong>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="sr-only">
          {todayStatuses.map((point) => (
            <li key={point.status}>
              {STATUS_DETAILS[point.status].label}: {point.count}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
