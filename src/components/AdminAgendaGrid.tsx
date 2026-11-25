import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { SITE } from "@/lib/site";
import {
  arenaNow,
  paymentProgressPercentages,
  toHHMM,
  toMin,
  type PaymentStatus,
} from "@/lib/arena-rules";

type UnitId = "unidade-1" | "unidade-2";
type AgendaSlot = { start: string; end: string };
export type AdminAgendaBooking = {
  id: string;
  date: string;
  name: string;
  status: PaymentStatus;
  paymentLabel: string;
  amountCents: number;
  receivedAmountCents: number;
  balanceDueCents: number;
  paymentNeedsReview: boolean;
  isAdminManual: boolean;
  unitId: UnitId;
  spaceId: string;
  slots: AgendaSlot[];
};
export type AdminAgendaSpace = {
  id: string;
  name: string;
  unit_id: UnitId;
  active: boolean;
  slot_minutes: number;
  sort_order: number;
};
export type AdminAgendaSchedule = {
  unit_id: UnitId;
  windows: unknown;
  override_label: string | null;
  has_override: boolean;
};

type AdminAgendaGridProps = {
  date: string;
  bookings: AdminAgendaBooking[];
  spaces: AdminAgendaSpace[];
  schedules: AdminAgendaSchedule[];
  onSelectBooking?: (booking: AdminAgendaBooking) => void;
};

type OpeningWindow = { start: string; end: string };
type TimeRange = { start: string; end: string };

function openingWindows(value: unknown): OpeningWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): OpeningWindow[] => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Record<string, unknown>;
    const startValue = candidate["start"];
    const endValue = candidate["end"];
    if (typeof startValue !== "string" || typeof endValue !== "string") return [];
    if (!/^\d{2}:\d{2}$/.test(startValue) || !/^\d{2}:\d{2}$/.test(endValue)) return [];
    const start = toMin(startValue);
    const end = toMin(endValue);
    if (start < 0 || start >= 1440 || end <= start || end > 1440) return [];
    return [{ start: startValue, end: endValue }];
  });
}

function mergedRanges(slots: AgendaSlot[]): TimeRange[] {
  const ordered = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const ranges: TimeRange[] = [];
  for (const slot of ordered) {
    const previous = ranges.at(-1);
    if (previous && toMin(slot.start) <= toMin(previous.end)) {
      if (toMin(slot.end) > toMin(previous.end)) previous.end = slot.end;
    } else {
      ranges.push({ start: slot.start, end: slot.end });
    }
  }
  return ranges;
}

function firstName(name: string) {
  return name.trim().split(/\s+/u)[0] || "Reserva";
}

function bookingPresentation(booking: AdminAgendaBooking) {
  if (booking.isAdminManual) {
    return {
      className: "is-manual",
      label: "Bloqueio manual · sem pagamento",
      occupies: true,
    };
  }
  if (booking.paymentNeedsReview) {
    return {
      className: "is-review",
      label: "Pagamento para revisão · não reativa reserva",
      occupies: false,
    };
  }
  if (
    booking.paymentLabel.includes("InfinitePay") &&
    booking.receivedAmountCents > 0 &&
    (booking.status === "paid" || booking.status === "pending")
  ) {
    const progress = paymentProgressPercentages(booking.amountCents, booking.receivedAmountCents);
    if (booking.balanceDueCents > 0) {
      return {
        className: "is-partial",
        label: `Pago ${progress.receivedPercentage}% · falta ${progress.remainingPercentage}%`,
        occupies: true,
      };
    }
    return { className: "is-paid", label: "Pago 100% · verificado", occupies: true };
  }
  if (booking.status === "paid") {
    return { className: "is-paid", label: "Pago 100% · confirmado", occupies: true };
  }
  return {
    className: "is-pending",
    label: "Checkout pendente · não bloqueia",
    occupies: false,
  };
}

export function AdminAgendaGrid({
  date,
  bookings,
  spaces,
  schedules,
  onSelectBooking,
}: AdminAgendaGridProps) {
  const [unitId, setUnitId] = useState<UnitId>("unidade-1");
  const [showNonBlocking, setShowNonBlocking] = useState(false);
  const [rowHeight, setRowHeight] = useState(20);
  const [compactViewport, setCompactViewport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const unit = SITE.units.find((item) => item.id === unitId);
  const unitSpaces = useMemo(
    () =>
      spaces
        .filter((space) => space.unit_id === unitId)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")),
    [spaces, unitId],
  );
  const schedule = schedules.find((item) => item.unit_id === unitId);
  const windows = openingWindows(schedule?.windows);
  const groupedBookings = bookings.filter((booking) => booking.unitId === unitId);
  const visibleBookings = groupedBookings.filter((booking) => {
    if (booking.isAdminManual || booking.status === "paid") return true;
    if (
      booking.paymentLabel.includes("InfinitePay") &&
      booking.receivedAmountCents > 0 &&
      booking.status === "pending"
    )
      return true;
    return showNonBlocking && (booking.paymentNeedsReview || booking.status === "pending");
  });
  const ranges = visibleBookings.flatMap((booking) => mergedRanges(booking.slots));
  const startCandidates = [
    ...windows.map((window) => toMin(window.start)),
    ...ranges.map((range) => toMin(range.start)),
  ];
  const endCandidates = [
    ...windows.map((window) => toMin(window.end)),
    ...ranges.map((range) => toMin(range.end)),
  ];
  const start = startCandidates.length ? Math.floor(Math.min(...startCandidates) / 15) * 15 : null;
  const end = endCandidates.length ? Math.ceil(Math.max(...endCandidates) / 15) * 15 : null;
  const timeRows = start !== null && end !== null && end > start ? (end - start) / 15 : 0;
  const now = arenaNow();
  const showNow =
    date === now.date &&
    start !== null &&
    end !== null &&
    now.minutes >= start &&
    now.minutes < end;
  const currentRow = showNow ? Math.floor((now.minutes - start!) / 15) + 2 : 0;
  const currentOffset = showNow ? ((now.minutes - start!) % 15) * (rowHeight / 15) : 0;
  const totalColumns = unitSpaces.length + 1;
  const templateColumns = compactViewport
    ? `2.65rem repeat(${Math.max(unitSpaces.length, 1)}, minmax(0, 1fr))`
    : `4.35rem repeat(${Math.max(unitSpaces.length, 1)}, minmax(9.5rem, 1fr))`;
  const templateRows = `${compactViewport ? "1.5rem" : "2.35rem"} repeat(${timeRows}, ${rowHeight}px)`;

  useLayoutEffect(() => {
    const updateScale = () => {
      const compact = window.innerWidth <= 640;
      setCompactViewport(compact);
      if (!compact || timeRows === 0) {
        setRowHeight(18);
        return;
      }

      const scrollTop = scrollRef.current?.getBoundingClientRect().top;
      const dockTop = document
        .querySelector<HTMLElement>(".admin-mobile-dock")
        ?.getBoundingClientRect().top;
      const legendHeight = legendRef.current?.getBoundingClientRect().height ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const available =
        scrollTop !== undefined
          ? (dockTop ?? viewportHeight - 58) - scrollTop - legendHeight - 24
          : viewportHeight - 430;
      const nextHeight = Math.max(7, Math.min(20, (available - 24) / timeRows));
      setRowHeight((current) => (Math.abs(current - nextHeight) < 0.25 ? current : nextHeight));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, [timeRows]);

  return (
    <section className="admin-agenda-board" aria-label="Grade da agenda por quadra">
      <div className="admin-agenda-controls">
        <div className="admin-unit-picker" role="group" aria-label="Escolher unidade">
          {SITE.units.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={unitId === item.id}
              onClick={() => setUnitId(item.id as UnitId)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <label className="admin-agenda-pending-toggle">
          <input
            type="checkbox"
            checked={showNonBlocking}
            onChange={(event) => setShowNonBlocking(event.target.checked)}
          />
          <span>Mostrar pagamentos pendentes ou em análise (não ocupam horário)</span>
        </label>
      </div>

      <div className="admin-agenda-meta">
        <div>
          <strong>{unit?.name ?? "Unidade"}</strong>
          <span>
            {windows.length
              ? `Funcionamento: ${windows.map((window) => `${window.start}–${window.end}`).join(" · ")}`
              : "Sem horário de funcionamento configurado para esta data"}
          </span>
          {schedule?.has_override && schedule.override_label && (
            <span className="admin-agenda-exception">Exceção: {schedule.override_label}</span>
          )}
        </div>
        <p>Arraste a grade para o lado para ver todas as quadras.</p>
      </div>

      {unitSpaces.length === 0 ? (
        <p className="admin-agenda-empty">Nenhuma quadra cadastrada nesta unidade.</p>
      ) : timeRows === 0 || start === null || end === null ? (
        <p className="admin-agenda-empty">
          Não há horário de funcionamento nem reserva confirmada para montar a grade nesta data.
        </p>
      ) : (
        <div
          className="admin-agenda-scroll"
          ref={scrollRef}
          tabIndex={0}
          aria-label="Grade de horários por quadra"
        >
          <div
            className="admin-agenda-grid"
            style={{
              gridTemplateColumns: templateColumns,
              gridTemplateRows: templateRows,
              minWidth: compactViewport ? "100%" : `${70 + unitSpaces.length * 152}px`,
            }}
          >
            <div className="admin-agenda-corner" style={{ gridRow: 1, gridColumn: 1 }}>
              Horário
            </div>
            {unitSpaces.map((space, index) => (
              <div
                key={`head-${space.id}`}
                className="admin-agenda-court-head"
                style={{ gridRow: 1, gridColumn: index + 2 }}
              >
                <span>{space.name}</span>
                {!space.active && <small>Quadra pausada</small>}
              </div>
            ))}
            {Array.from({ length: timeRows }, (_, index) => {
              const minute = start + index * 15;
              const label = index % 2 === 0 ? toHHMM(minute) : "";
              return (
                <div
                  key={`time-${minute}`}
                  className={`admin-agenda-time ${label ? "has-label" : ""}`}
                  style={{ gridRow: index + 2, gridColumn: 1 }}
                >
                  {label}
                </div>
              );
            })}
            {Array.from({ length: timeRows }, (_, rowIndex) =>
              unitSpaces.map((space, columnIndex) => {
                const slotStart = start + rowIndex * 15;
                const slotEnd = slotStart + 15;
                const isOpen = windows.some(
                  (window) => slotStart >= toMin(window.start) && slotEnd <= toMin(window.end),
                );
                return (
                  <div
                    key={`cell-${space.id}-${slotStart}`}
                    className={`admin-agenda-cell ${isOpen ? "is-open" : "is-closed"}`}
                    style={{ gridRow: rowIndex + 2, gridColumn: columnIndex + 2 }}
                    aria-hidden="true"
                  />
                );
              }),
            )}
            {visibleBookings.flatMap((booking) => {
              const columnIndex = unitSpaces.findIndex((space) => space.id === booking.spaceId);
              if (columnIndex < 0) return [];
              const presentation = bookingPresentation(booking);
              return mergedRanges(booking.slots).map((range, rangeIndex) => {
                const rawStart = toMin(range.start);
                const rawEnd = toMin(range.end);
                const rowStart = Math.floor((rawStart - start) / 15) + 2;
                const rowEnd = Math.max(rowStart + 1, Math.ceil((rawEnd - start) / 15) + 2);
                const outsideOpening =
                  presentation.occupies &&
                  !windows.some(
                    (window) => rawStart >= toMin(window.start) && rawEnd <= toMin(window.end),
                  );
                const label = `${firstName(booking.name)} · ${range.start.slice(0, 5)}–${range.end.slice(0, 5)}`;
                return (
                  <button
                    type="button"
                    key={`${booking.id}-${rangeIndex}`}
                    className={`admin-agenda-booking ${presentation.className} ${outsideOpening ? "is-outside-hours" : ""}`}
                    style={{ gridRow: `${rowStart} / ${rowEnd}`, gridColumn: columnIndex + 2 }}
                    aria-label={`${booking.name}, ${range.start.slice(0, 5)} às ${range.end.slice(0, 5)}, ${presentation.label}${outsideOpening ? ", fora da janela de funcionamento cadastrada" : ""}`}
                    title={`${booking.name} · ${range.start.slice(0, 5)}–${range.end.slice(0, 5)} · ${presentation.label}${outsideOpening ? " · Reserva fora da janela cadastrada" : ""}`}
                    onClick={() => onSelectBooking?.(booking)}
                  >
                    <strong>{label}</strong>
                    <span>{presentation.label}</span>
                  </button>
                );
              });
            })}
            {showNow && (
              <>
                <span
                  className="admin-agenda-now-label"
                  style={{
                    gridRow: currentRow,
                    gridColumn: 1,
                    transform: `translateY(${currentOffset - 8}px)`,
                  }}
                >
                  Agora
                </span>
                <span
                  className="admin-agenda-now-line"
                  style={{
                    gridRow: currentRow,
                    gridColumn: `2 / ${totalColumns + 1}`,
                    transform: `translateY(${currentOffset}px)`,
                  }}
                  aria-label="Horário atual"
                />
              </>
            )}
          </div>
        </div>
      )}

      <ul ref={legendRef} className="admin-agenda-legend" aria-label="Legenda da agenda">
        <li>
          <span className="is-paid" /> Pagamento confirmado — horário ocupado
        </li>
        <li>
          <span className="is-manual" /> Reserva manual do Master — horário bloqueado
        </li>
        {showNonBlocking && (
          <li>
            <span className="is-pending" /> Pagamento pendente ou em análise — ainda não ocupa
            horário
          </li>
        )}
        <li>
          <span className="is-closed" /> Quadra fora do horário de funcionamento cadastrado
        </li>
      </ul>
    </section>
  );
}
