export type AdminReservationStatus =
  "paid" | "manual" | "pending" | "review" | "cancelled" | "expired" | "failed";

export type AdminReservationGroupAggregate = {
  date: string;
  allPaid: boolean;
  manual: boolean;
  activePending: boolean;
  providerPaid: boolean;
  cancelled: boolean;
  expired: boolean;
  expiredPending: boolean;
  failed: boolean;
};

export type AdminDashboardDailyPoint = {
  date: string;
  paid: number;
  manual: number;
  pending: number;
  review: number;
};

export type AdminDashboardStatusPoint = {
  status: AdminReservationStatus;
  count: number;
};

export const ADMIN_RESERVATION_STATUSES: AdminReservationStatus[] = [
  "paid",
  "manual",
  "pending",
  "review",
  "cancelled",
  "expired",
  "failed",
];

export function classifyAdminReservationGroup(
  group: AdminReservationGroupAggregate,
): AdminReservationStatus {
  if (group.allPaid) return "paid";
  if (group.manual) return "manual";
  if (group.providerPaid) {
    if (group.cancelled || group.expired || group.failed) return "review";
    return group.activePending || group.expiredPending ? "pending" : "review";
  }
  if (group.activePending) return "pending";
  if (group.cancelled) return "cancelled";
  if (group.expired || group.expiredPending) return "expired";
  if (group.expired) return "expired";
  return "failed";
}

function shiftISODate(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Converte grupos já agregados no servidor em séries pequenas e livres de PII. */
export function buildAdminDashboardAnalytics(
  today: string,
  groups: AdminReservationGroupAggregate[],
) {
  const weekly: AdminDashboardDailyPoint[] = Array.from({ length: 7 }, (_, index) => ({
    date: shiftISODate(today, index - 6),
    paid: 0,
    manual: 0,
    pending: 0,
    review: 0,
  }));
  const weeklyByDate = new Map(weekly.map((point) => [point.date, point]));
  const todayCounts = new Map<AdminReservationStatus, number>(
    ADMIN_RESERVATION_STATUSES.map((status) => [status, 0]),
  );

  for (const group of groups) {
    const status = classifyAdminReservationGroup(group);
    const day = weeklyByDate.get(group.date);
    if (day && status in day) {
      if (status === "paid" || status === "manual" || status === "pending" || status === "review") {
        day[status] += 1;
      }
    }
    if (group.date === today) todayCounts.set(status, (todayCounts.get(status) ?? 0) + 1);
  }

  const todayStatuses = ADMIN_RESERVATION_STATUSES.map((status) => ({
    status,
    count: todayCounts.get(status) ?? 0,
  }));

  return { weekly, todayStatuses };
}
