import { describe, expect, it } from "vitest";
import {
  buildAdminDashboardAnalytics,
  classifyAdminReservationGroup,
  type AdminReservationGroupAggregate,
} from "./admin-dashboard";

const makeGroup = (
  overrides: Partial<AdminReservationGroupAggregate> = {},
): AdminReservationGroupAggregate => ({
  date: "2026-11-24",
  allPaid: false,
  manual: false,
  activePending: false,
  providerPaid: false,
  cancelled: false,
  expired: false,
  expiredPending: false,
  failed: false,
  ...overrides,
});

describe("Admin dashboard aggregates", () => {
  it("separates payment-confirmed, manual, pending and review states", () => {
    expect(classifyAdminReservationGroup(makeGroup({ allPaid: true }))).toBe("paid");
    expect(classifyAdminReservationGroup(makeGroup({ manual: true }))).toBe("manual");
    expect(classifyAdminReservationGroup(makeGroup({ activePending: true }))).toBe("pending");
    expect(classifyAdminReservationGroup(makeGroup({ providerPaid: true }))).toBe("review");
    expect(classifyAdminReservationGroup(makeGroup({ expiredPending: true }))).toBe("expired");
  });

  it("keeps verified partial payments active and reserves review for terminal conflicts", () => {
    expect(classifyAdminReservationGroup(makeGroup({ allPaid: true, activePending: true }))).toBe(
      "paid",
    );
    expect(
      classifyAdminReservationGroup(makeGroup({ providerPaid: true, activePending: true })),
    ).toBe("pending");
    expect(
      classifyAdminReservationGroup(makeGroup({ providerPaid: true, expiredPending: true })),
    ).toBe("pending");
    expect(classifyAdminReservationGroup(makeGroup({ providerPaid: true, expired: true }))).toBe(
      "review",
    );
    expect(classifyAdminReservationGroup(makeGroup({ providerPaid: true, cancelled: true }))).toBe(
      "review",
    );
  });

  it("builds seven date buckets including zero days and a separate status breakdown", () => {
    const analytics = buildAdminDashboardAnalytics("2026-11-24", [
      makeGroup({ date: "2026-11-24", allPaid: true }),
      makeGroup({ date: "2026-11-24", manual: true }),
      makeGroup({ date: "2026-11-23", activePending: true }),
      makeGroup({ date: "2026-11-24", providerPaid: true }),
      makeGroup({ date: "2026-11-24", cancelled: true }),
    ]);

    expect(analytics.weekly).toHaveLength(7);
    expect(analytics.weekly[0]).toEqual({
      date: "2026-11-18",
      paid: 0,
      manual: 0,
      pending: 0,
      review: 0,
    });
    expect(analytics.weekly.at(-1)).toEqual({
      date: "2026-11-24",
      paid: 1,
      manual: 1,
      pending: 0,
      review: 1,
    });
    expect(analytics.todayStatuses.find((item) => item.status === "cancelled")?.count).toBe(1);
    expect(analytics.todayStatuses.find((item) => item.status === "pending")?.count).toBe(0);
  });
});
