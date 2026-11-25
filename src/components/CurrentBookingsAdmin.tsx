import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SITE } from "@/lib/site";
import {
  AdminAgendaGrid,
  type AdminAgendaBooking,
  type AdminAgendaSchedule,
  type AdminAgendaSpace,
} from "@/components/AdminAgendaGrid";
import {
  adminArenaSettings,
  adminCreateManualBooking,
  adminCurrentBookings,
  adminCurrentDay,
  adminUpdateBooking,
} from "@/lib/arena.functions";
import {
  arenaNow,
  formatBRL,
  paymentProgressPercentages,
  PAYMENT_LABEL,
  STATUS_LABEL,
  verifiedPaymentAmountCents,
  toHHMM,
  toMin,
  validateAdminManualRange,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/arena-rules";

type UnitId = "unidade-1" | "unidade-2";
type BookingRow = {
  id: string;
  booking_code: string;
  group_code: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  phone: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  is_admin_manual?: boolean;
  payment_provider: string | null;
  provider_payment_status: string | null;
  provider_capture_method: string | null;
  provider_amount_cents: number | null;
  amount_cents: number;
  notes: string | null;
  space_id: string;
  created_at: string;
  space_name: string;
  unit_id: UnitId;
  cancellation_deadline_passed?: boolean;
};
type BookingGroup = {
  id: string;
  code: string;
  date: string;
  name: string;
  phone: string;
  unitId: UnitId;
  spaceId: string;
  spaceName: string;
  paymentLabel: string;
  isAdminManual: boolean;
  status: PaymentStatus;
  paymentNeedsReview: boolean;
  amountCents: number;
  chargeAmountCents: number;
  expectedBalanceDueCents: number;
  balanceDueCents: number;
  receivedAmountCents: number;
  cancellationDeadlinePassed: boolean;
  slots: Array<{ start: string; end: string }>;
};

const BADGE: Record<PaymentStatus, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

function shiftDate(iso: string, amount: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(iso: string, amount: number) {
  const date = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function monthEnd(iso: string) {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0, 12)).toISOString().slice(0, 10);
}

function formatSlotRanges(slots: Array<{ start: string; end: string }>) {
  const ranges: Array<[string, string]> = [];
  for (const slot of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const start = slot.start.slice(0, 5);
    const end = slot.end.slice(0, 5);
    const previous = ranges.at(-1);
    if (previous && previous[1] === start) previous[1] = end;
    else ranges.push([start, end]);
  }
  return ranges.map(([start, end]) => `${start} – ${end === "24:00" ? "00:00" : end}`).join(" · ");
}

function groupBookings(rows: BookingRow[]): BookingGroup[] {
  const grouped = new Map<string, BookingRow[]>();
  for (const row of rows) {
    const key = row.group_code || row.booking_code;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped.entries()]
    .map(([code, items]) => {
      const first = items[0]!;
      const unitNumber = first.unit_id === "unidade-1" ? 1 : 2;
      const statuses = items.map((row) => row.payment_status);
      const status: PaymentStatus = statuses.every((value) => value === "paid")
        ? "paid"
        : statuses.includes("pending")
          ? "pending"
          : statuses.includes("expired")
            ? "expired"
            : statuses.includes("cancelled")
              ? "cancelled"
              : statuses.includes("failed")
                ? "failed"
                : first.payment_status;
      const isAdminManual = items.some((row) => row.is_admin_manual === true);
      const hasInfinitePayPayment = items.some((row) => row.payment_provider === "infinitepay");
      const paymentNeedsReview =
        !isAdminManual &&
        hasInfinitePayPayment &&
        items.some((row) => row.provider_payment_status === "paid") &&
        items.some(
          (row) =>
            row.payment_status === "cancelled" ||
            row.payment_status === "expired" ||
            row.payment_status === "failed",
        );
      const captureMethod =
        items.find((row) => row.provider_capture_method)?.provider_capture_method ?? null;
      const paymentLabel = isAdminManual
        ? "Reserva manual · sem pagamento"
        : hasInfinitePayPayment
          ? captureMethod === "pix"
            ? "Pix · InfinitePay"
            : captureMethod === "credit_card"
              ? "Cartão · InfinitePay"
              : "Pix ou cartão · InfinitePay"
          : PAYMENT_LABEL[first.payment_method];
      const amountCents = items.reduce((sum, row) => sum + Number(row.amount_cents), 0);
      const chargeAmountCents = items.reduce(
        (sum, row) => sum + Number(row.provider_amount_cents ?? 0),
        0,
      );
      const receivedAmountCents = verifiedPaymentAmountCents(
        items.map((row) => ({
          provider: row.payment_provider,
          providerStatus: row.provider_payment_status,
          bookingStatus: row.payment_status,
          amountCents: row.provider_amount_cents,
        })),
      );
      const expectedBalanceDueCents = Math.max(0, amountCents - chargeAmountCents);
      const balanceDueCents = hasInfinitePayPayment
        ? Math.max(0, amountCents - receivedAmountCents)
        : expectedBalanceDueCents;
      return {
        id: first.id,
        code,
        date: first.booking_date,
        name: first.customer_name,
        phone: first.phone,
        unitId: first.unit_id,
        spaceId: first.space_id,
        spaceName: `Unidade ${unitNumber} · ${first.space_name}`,
        paymentLabel,
        isAdminManual,
        status,
        paymentNeedsReview,
        amountCents,
        chargeAmountCents,
        expectedBalanceDueCents,
        balanceDueCents,
        receivedAmountCents,
        cancellationDeadlinePassed: items.some((row) => row.cancellation_deadline_passed),
        slots: items.map((row) => ({ start: row.start_time, end: row.end_time })),
      };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.slots[0]!.start.localeCompare(b.slots[0]!.start),
    );
}

function bookingPaymentSummary(booking: BookingGroup) {
  const progress = paymentProgressPercentages(booking.amountCents, booking.receivedAmountCents);
  const method = booking.paymentLabel.toLocaleLowerCase("pt-BR").includes("pix")
    ? "PIX"
    : booking.paymentLabel.includes("InfinitePay")
      ? "InfinitePay"
      : "Pagamento";
  if (booking.isAdminManual) return "Bloqueio manual";
  if (booking.paymentNeedsReview) return "Revisar pagamento";
  if (booking.receivedAmountCents > 0) {
    return booking.balanceDueCents > 0
      ? `${method} pago ${progress.receivedPercentage}% · falta ${progress.remainingPercentage}%`
      : `${method} · pago 100%`;
  }
  return STATUS_LABEL[booking.status];
}

function bookingDurationMinutes(booking: BookingGroup) {
  return booking.slots.reduce(
    (total, slot) => total + Math.max(0, toMin(slot.end) - toMin(slot.start)),
    0,
  );
}

function AgendaBookingButton({
  booking,
  onSelect,
  compact = false,
}: {
  booking: BookingGroup;
  onSelect: (booking: BookingGroup) => void;
  compact?: boolean;
}) {
  const statusClass = booking.isAdminManual
    ? "is-manual"
    : booking.paymentNeedsReview
      ? "is-review"
      : booking.receivedAmountCents > 0 && booking.balanceDueCents > 0
        ? "is-partial"
        : booking.status === "paid"
          ? "is-paid"
          : "is-pending";
  const duration = bookingDurationMinutes(booking);
  const timeLabel = formatSlotRanges(booking.slots);
  return (
    <button
      type="button"
      className={`admin-agenda-event ${statusClass} ${compact ? "is-compact" : ""}`}
      style={
        compact ? undefined : { height: `${Math.min(156, Math.max(38, (duration / 60) * 46))}px` }
      }
      onClick={() => onSelect(booking)}
      title={`${booking.name} · ${booking.spaceName} · ${timeLabel} · ${bookingPaymentSummary(booking)}`}
    >
      <strong>
        {booking.name.trim().split(/\s+/u)[0]} · {timeLabel}
      </strong>
      {!compact && <span>{booking.spaceName}</span>}
      <small>{bookingPaymentSummary(booking)}</small>
    </button>
  );
}

function formatBookingDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T12:00:00Z`))
    .replace(" de ", " ");
}

function formatBookingWeekday(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

const MANUAL_START_OPTIONS = Array.from({ length: 96 }, (_, index) => toHHMM(index * 15));
const MANUAL_END_OPTIONS = Array.from({ length: 96 }, (_, index) => toHHMM((index + 1) * 15));

export function CurrentBookingsAdmin({
  view = "agenda",
  isMaster = false,
  manualFormOpen = false,
  onManualFormOpenChange,
}: {
  view?: "agenda" | "reservations";
  isMaster?: boolean;
  manualFormOpen?: boolean;
  onManualFormOpenChange?: (open: boolean) => void;
}) {
  const fetchCurrentDay = useServerFn(adminCurrentDay);
  const fetchCurrentBookings = useServerFn(adminCurrentBookings);
  const fetchArenaSettings = useServerFn(adminArenaSettings);
  const createManual = useServerFn(adminCreateManualBooking);
  const updateBooking = useServerFn(adminUpdateBooking);
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => arenaNow().date);
  const [agendaMode, setAgendaMode] = useState<"day" | "week" | "month">("day");
  const [selectedBooking, setSelectedBooking] = useState<BookingGroup | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [cancelBookingToConfirm, setCancelBookingToConfirm] = useState<BookingGroup | null>(null);
  const cancelDialogRef = useRef<HTMLDialogElement>(null);
  const manualCreateDialogRef = useRef<HTMLDialogElement>(null);
  const bookingDetailsDialogRef = useRef<HTMLDialogElement>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [manualUnitId, setManualUnitId] = useState<UnitId>("unidade-1");
  const [manualSpaceId, setManualSpaceId] = useState("");
  const [manualDate, setManualDate] = useState(() => arenaNow().date);
  const [manualStart, setManualStart] = useState("00:00");
  const [manualEnd, setManualEnd] = useState("01:00");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);
  const arenaSettingsQuery = useQuery({
    queryKey: ["admin-arena-settings"],
    queryFn: () => fetchArenaSettings(),
    enabled: isMaster && (view === "reservations" || manualFormOpen),
    retry: false,
  });
  const manualSpaces = useMemo(
    () => arenaSettingsQuery.data?.spaces.filter((space) => space.unitId === manualUnitId) ?? [],
    [arenaSettingsQuery.data?.spaces, manualUnitId],
  );
  useEffect(() => {
    if (manualSpaces.length && !manualSpaces.some((space) => space.id === manualSpaceId)) {
      setManualSpaceId(manualSpaces[0]!.id);
    }
  }, [manualSpaces, manualSpaceId]);
  const weekStart = shiftDate(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
  const weekEnd = shiftDate(weekStart, 6);
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthLast = monthEnd(date);
  const rangeStart =
    view === "agenda" && agendaMode === "month"
      ? monthStart
      : view === "agenda" && agendaMode === "week"
        ? weekStart
        : arenaNow().date;
  const rangeEnd =
    view === "agenda" && agendaMode === "month"
      ? monthLast
      : view === "agenda" && agendaMode === "week"
        ? weekEnd
        : shiftDate(rangeStart, 60);
  const query = useQuery({
    queryKey:
      view === "agenda" && agendaMode === "day"
        ? ["admin-current-day", date]
        : ["admin-current-bookings", rangeStart, rangeEnd],
    queryFn: () =>
      view === "agenda" && agendaMode === "day"
        ? fetchCurrentDay({ data: { date } })
        : fetchCurrentBookings({ data: { fromDate: rangeStart, toDate: rangeEnd } }),
    retry: false,
    refetchInterval: 30_000,
  });
  const currentBookingsData = query.data as { bookings?: BookingRow[] } | undefined;
  const groups = useMemo(
    () => groupBookings(currentBookingsData?.bookings ?? []),
    [currentBookingsData?.bookings],
  );
  const agendaData = query.data as
    { spaces?: AdminAgendaSpace[]; schedules?: AdminAgendaSchedule[] } | undefined;
  const agendaBookings: AdminAgendaBooking[] = groups.map((booking) => ({
    id: booking.id,
    date: booking.date,
    name: booking.name,
    status: booking.status,
    paymentLabel: booking.paymentLabel,
    amountCents: booking.amountCents,
    receivedAmountCents: booking.receivedAmountCents,
    balanceDueCents: booking.balanceDueCents,
    paymentNeedsReview: booking.paymentNeedsReview,
    isAdminManual: booking.isAdminManual,
    unitId: booking.unitId,
    spaceId: booking.spaceId,
    slots: booking.slots,
  }));
  useEffect(() => {
    const dialog = cancelDialogRef.current;
    if (!dialog) return;
    if (cancelBookingToConfirm && !dialog.open) dialog.showModal();
    if (!cancelBookingToConfirm && dialog.open) dialog.close();
  }, [cancelBookingToConfirm]);
  useEffect(() => {
    const dialog = manualCreateDialogRef.current;
    if (!dialog) return;
    if (manualFormOpen && !dialog.open) dialog.showModal();
    if (!manualFormOpen && dialog.open) dialog.close();
  }, [manualFormOpen]);
  useEffect(() => {
    const dialog = bookingDetailsDialogRef.current;
    if (!dialog) return;
    if (selectedBooking && !dialog.open) dialog.showModal();
    if (!selectedBooking && dialog.open) dialog.close();
  }, [selectedBooking]);
  const attentionRequired = groups.filter(
    (booking) =>
      !booking.isAdminManual && (booking.status === "pending" || booking.paymentNeedsReview),
  ).length;
  const confirmed = groups.filter((booking) => booking.status === "paid").length;
  const paidAmount = groups.reduce((sum, booking) => sum + booking.receivedAmountCents, 0);
  const filteredGroups = useMemo(() => {
    const term = searchText.trim().toLocaleLowerCase("pt-BR");
    return groups.filter((booking) => {
      if (statusFilter !== "all" && booking.status !== statusFilter) return false;
      if (!term) return true;
      return [
        booking.name,
        booking.phone,
        booking.code,
        booking.spaceName,
        formatSlotRanges(booking.slots),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [groups, searchText, statusFilter]);

  async function act(
    booking: BookingGroup,
    action: "mark_paid" | "cancel" | "confirm_received_payment",
    lateCancelConfirmed = false,
    cancelConfirmed = false,
  ) {
    const question =
      action === "mark_paid"
        ? "Confirmar manualmente o pagamento desta reserva e de todos os horários do grupo?"
        : action === "confirm_received_payment"
          ? "A InfinitePay confirmou o pagamento. Verifique na InfinitePay se a cobrança não foi estornada e confira se os horários seguem livres; confirmar bloqueará novamente as quadras. Continuar?"
          : "Cancelar esta reserva e liberar todos os horários do grupo? Esta ação não estorna pagamentos; faça eventual estorno diretamente na InfinitePay.";
    if (action === "cancel" && !cancelConfirmed) {
      setCancelBookingToConfirm(booking);
      return;
    } else if (action !== "cancel" && !window.confirm(question)) return;
    setWorking(booking.code);
    try {
      const result = await updateBooking({
        data: { id: booking.id, action, confirmLateCancel: lateCancelConfirmed },
      });
      if (!result.ok) {
        if ("requiresLateCancelConfirmation" in result && result.requiresLateCancelConfirmation) {
          setCancelBookingToConfirm({ ...booking, cancellationDeadlinePassed: true });
          return;
        }
        toast.error(result.error);
        return;
      }
      if (action === "cancel" && "noticeCreated" in result && result.noticeCreated === false) {
        toast.warning("Reserva cancelada, mas o aviso público da vaga não foi criado.");
      } else if (
        action === "cancel" &&
        "noticeCreated" in result &&
        result.noticeCreated === true
      ) {
        toast.success("Reserva cancelada. A vaga foi anunciada no site por até 12 horas.");
      } else {
        toast.success(
          action === "mark_paid"
            ? "Reserva confirmada."
            : action === "confirm_received_payment"
              ? "Reserva confirmada após revisão do pagamento."
              : "Reserva cancelada.",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-current-day"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-current-bookings"] });
      if (action === "cancel") {
        await queryClient.invalidateQueries({ queryKey: ["public-released-slot-offers"] });
      }
    } catch {
      toast.error("Não foi possível atualizar esta reserva.");
    } finally {
      setWorking(null);
    }
  }

  async function submitManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const range = validateAdminManualRange(manualStart, manualEnd);
    if (!range.ok) {
      toast.error(range.reason);
      return;
    }
    if (!manualSpaceId) {
      toast.error("Selecione uma quadra.");
      return;
    }
    setCreatingManual(true);
    try {
      const result = await createManual({
        data: {
          unitId: manualUnitId,
          spaceId: manualSpaceId,
          date: manualDate,
          start: manualStart,
          end: manualEnd,
          name: manualName,
          phone: manualPhone,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.pendingCheckoutCount > 0) {
        toast.warning(
          `Bloqueio criado (${result.bookingCode}). Há ${result.pendingCheckoutCount} checkout(s) pendente(s) nesse intervalo; qualquer pagamento validado depois ficará para revisão e eventual estorno manual.`,
          { duration: 9000 },
        );
      } else {
        toast.success(`Reserva manual criada e bloqueada (${result.bookingCode}).`);
      }
      setManualName("");
      setManualPhone("");
      onManualFormOpenChange?.(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-current-day"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-current-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["booking-availability"] }),
      ]);
    } catch {
      toast.error("Não foi possível criar a reserva manual.");
    } finally {
      setCreatingManual(false);
    }
  }

  const dateText = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const periodMonthText = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 7)}-01T12:00:00Z`));

  return (
    <section
      className={`mt-2 overflow-hidden rounded-3xl border border-border bg-card/45 ${view === "agenda" ? "admin-agenda-page" : ""}`}
      aria-labelledby="current-bookings-heading"
    >
      <div
        className={`border-b border-border px-5 py-5 sm:px-7 ${view === "agenda" ? "admin-agenda-page-head" : ""}`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
              {view === "agenda"
                ? agendaMode === "day"
                  ? "Agenda diária"
                  : agendaMode === "week"
                    ? "Agenda semanal"
                    : "Agenda mensal"
                : "Gestão de reservas"}
            </p>
            <h2
              id="current-bookings-heading"
              className="mt-1 font-display text-3xl font-bold uppercase"
            >
              {view === "agenda" ? "Agenda" : "Reservas"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "agenda"
                ? "Acompanhe reservas por dia, unidade, quadra e horário."
                : "Pesquise reservas online e bloqueios manuais nos próximos 60 dias."}
            </p>
            {view === "agenda" && (
              <p className="admin-agenda-period-label" aria-live="polite">
                {periodMonthText}
              </p>
            )}
          </div>
          {view === "agenda" ? (
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex rounded-lg border border-border p-1"
                role="group"
                aria-label="Modo da agenda"
              >
                {(
                  [
                    ["day", "Dia"],
                    ["week", "Semana"],
                    ["month", "Mês"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={agendaMode === mode}
                    onClick={() => setAgendaMode(mode)}
                    className={`min-h-9 rounded-md px-3 text-sm font-semibold ${agendaMode === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDate((current) =>
                    agendaMode === "month"
                      ? shiftMonth(current, -1)
                      : shiftDate(current, agendaMode === "week" ? -7 : -1),
                  )
                }
                aria-label={agendaMode === "month" ? "Mês anterior" : "Período anterior"}
                className="grid h-11 w-11 place-items-center rounded-lg border border-border hover:border-primary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="date"
                aria-label="Data das reservas"
                value={date}
                onChange={(event) => event.target.value && setDate(event.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  setDate((current) =>
                    agendaMode === "month"
                      ? shiftMonth(current, 1)
                      : shiftDate(current, agendaMode === "week" ? 7 : 1),
                  )
                }
                aria-label={agendaMode === "month" ? "Próximo mês" : "Próximo período"}
                className="grid h-11 w-11 place-items-center rounded-lg border border-border hover:border-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDate(arenaNow().date)}
                className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:border-primary"
              >
                Hoje
              </button>
            </div>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              {formatBookingDate(rangeStart)} — {formatBookingDate(rangeEnd)}
            </p>
          )}
        </div>
      </div>
      <div className="p-5 sm:p-7">
        {view === "agenda" && agendaMode === "day" && (
          <p className="mb-2 text-xs font-semibold capitalize text-muted-foreground">{dateText}</p>
        )}
        {query.isLoading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando reservas…
          </p>
        ) : query.isError ? (
          <p
            role="alert"
            className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning"
          >
            Não foi possível carregar as reservas atuais. Atualize a página ou tente novamente.
          </p>
        ) : (
          <>
            {view !== "agenda" && (
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Reservas", String(groups.length)],
                  ["Checkouts pendentes/revisão", String(attentionRequired)],
                  ["Confirmadas", String(confirmed)],
                  ["Recebido · verificado", formatBRL(paidAmount)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-border bg-background p-3 sm:p-4"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-display text-xl font-bold sm:text-2xl">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {view === "agenda" && agendaMode === "week" && (
              <div
                className="admin-agenda-period-scroll"
                aria-label="Agenda semanal, domingo a sábado"
              >
                <div className="admin-agenda-week-grid">
                  {Array.from({ length: 7 }, (_, index) => {
                    const day = shiftDate(weekStart, index);
                    const dayLabel = new Intl.DateTimeFormat("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${day}T12:00:00Z`));
                    const dayBookings = groups.filter(
                      (booking) =>
                        booking.date === day &&
                        !["cancelled", "expired", "failed"].includes(booking.status),
                    );
                    return (
                      <section key={day} className="admin-agenda-day-column">
                        <button
                          type="button"
                          className="admin-agenda-day-heading"
                          onClick={() => {
                            setDate(day);
                            setAgendaMode("day");
                          }}
                        >
                          <span>{dayLabel}</span>
                          <small>
                            {dayBookings.length} reserva{dayBookings.length === 1 ? "" : "s"}
                          </small>
                        </button>
                        <div className="admin-agenda-event-list">
                          {dayBookings.length ? (
                            dayBookings.map((booking) => (
                              <AgendaBookingButton
                                key={booking.code}
                                booking={booking}
                                onSelect={setSelectedBooking}
                              />
                            ))
                          ) : (
                            <p className="admin-agenda-empty-day">Sem reservas</p>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
            {view === "agenda" && agendaMode === "month" && (
              <div className="admin-agenda-month-scroll" aria-label="Agenda mensal">
                <div className="admin-agenda-month-grid">
                  {[
                    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                      <span key={day} className="admin-agenda-month-weekday">
                        {day}
                      </span>
                    )),
                  ]}
                  {Array.from(
                    {
                      length:
                        Math.ceil(
                          (new Date(`${monthStart}T12:00:00Z`).getUTCDay() +
                            Number(monthLast.slice(8, 10))) /
                            7,
                        ) * 7,
                    },
                    (_, index) => {
                      const offset = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
                      const calendarDay = shiftDate(monthStart, index - offset);
                      const inCurrentMonth = calendarDay.startsWith(monthStart.slice(0, 7));
                      const dayBookings = groups.filter(
                        (booking) =>
                          booking.date === calendarDay &&
                          !["cancelled", "expired", "failed"].includes(booking.status),
                      );
                      return (
                        <section
                          key={calendarDay}
                          className={`admin-agenda-month-day ${inCurrentMonth ? "" : "is-outside-month"}`}
                        >
                          <button
                            type="button"
                            className="admin-agenda-month-date"
                            disabled={!inCurrentMonth}
                            onClick={() => {
                              setDate(calendarDay);
                              setAgendaMode("day");
                            }}
                          >
                            {calendarDay.slice(8, 10)}
                          </button>
                          <div className="admin-agenda-month-events">
                            {dayBookings.slice(0, 3).map((booking) => (
                              <AgendaBookingButton
                                key={booking.code}
                                booking={booking}
                                compact
                                onSelect={setSelectedBooking}
                              />
                            ))}
                            {dayBookings.length > 3 && (
                              <button
                                type="button"
                                className="admin-agenda-month-more"
                                onClick={() => {
                                  setDate(calendarDay);
                                  setAgendaMode("day");
                                }}
                              >
                                +{dayBookings.length - 3} mais
                              </button>
                            )}
                          </div>
                        </section>
                      );
                    },
                  )}
                </div>
              </div>
            )}
            {view === "agenda" && agendaMode === "day" && (
              <AdminAgendaGrid
                date={date}
                bookings={agendaBookings}
                spaces={agendaData?.spaces ?? []}
                schedules={agendaData?.schedules ?? []}
                onSelectBooking={(booking) => {
                  const selected = groups.find((item) => item.id === booking.id);
                  if (selected) setSelectedBooking(selected);
                }}
              />
            )}
            {view === "reservations" && isMaster && (
              <section className="admin-manual-entry" aria-labelledby="manual-booking-heading">
                <div>
                  <h3 id="manual-booking-heading">Criar reserva manual</h3>
                  <p>Exclusivo do Master · sem cobrança nem pagamento fictício.</p>
                </div>
                <button
                  type="button"
                  className="admin-manual-entry-button"
                  onClick={() => onManualFormOpenChange?.(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nova reserva
                </button>
              </section>
            )}
            {view === "reservations" && (
              <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Buscar reservas
                  <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3">
                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <input
                      type="search"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Nome, telefone, código ou quadra"
                      className="min-w-0 flex-1 bg-transparent text-sm font-normal normal-case tracking-normal outline-none"
                    />
                  </span>
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as PaymentStatus | "all")
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal"
                  >
                    <option value="all">Todos os status</option>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {view === "reservations" && (
              <>
                <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
                  Mostrando {filteredGroups.length} de {groups.length} reservas neste período.
                </p>
                {groups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
                    <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 font-semibold">Nenhuma reserva neste período</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Reservas confirmadas, checkouts e bloqueios manuais aparecerão aqui.
                    </p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma reserva corresponde à busca ou ao status selecionado.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredGroups.map((booking) => {
                      const paymentProgress = paymentProgressPercentages(
                        booking.amountCents,
                        booking.receivedAmountCents,
                      );
                      const statusLabel = booking.isAdminManual
                        ? "Bloqueio manual · ativo"
                        : booking.paymentNeedsReview
                          ? "Pagamento recebido · revisar"
                          : booking.paymentLabel.includes("InfinitePay") &&
                              booking.receivedAmountCents > 0
                            ? booking.balanceDueCents > 0
                              ? `Pago ${paymentProgress.receivedPercentage}% · falta ${paymentProgress.remainingPercentage}%`
                              : "Pago 100% · verificado"
                            : STATUS_LABEL[booking.status];
                      const unitNumber = booking.unitId === "unidade-1" ? "1" : "2";
                      const message = `Olá, ${booking.name.split(" ")[0]}, sobre a sua reserva na Arena Leste ${unitNumber}, ${formatBookingWeekday(booking.date)}, dia ${booking.date.split("-").reverse().join("/")}, das ${formatSlotRanges(booking.slots)}.`;
                      return (
                        <li
                          key={booking.code}
                          className="rounded-2xl border border-border bg-background p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{booking.name}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {view === "reservations"
                                  ? `${formatBookingDate(booking.date)} · `
                                  : ""}
                                {booking.spaceName} · {formatSlotRanges(booking.slots)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {booking.phone} · {booking.paymentLabel} · Código {booking.code}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${booking.isAdminManual ? "bg-primary/10 text-primary" : BADGE[booking.status]}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {booking.paymentNeedsReview && (
                            <p
                              role="alert"
                              className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning"
                            >
                              Pagamento recebido, mas a reserva não foi confirmada automaticamente.
                              Use a confirmação após revisão somente se o horário ainda não terminou
                              e continua livre; caso contrário, contate o cliente e trate eventual
                              estorno na InfinitePay.
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                            <div>
                              <strong className="font-display text-xl">
                                {booking.isAdminManual
                                  ? "Bloqueio manual · sem pagamento"
                                  : `Reserva: ${formatBRL(booking.amountCents)}`}
                              </strong>
                              {!booking.isAdminManual &&
                              booking.paymentLabel.includes("InfinitePay") ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {booking.receivedAmountCents > 0
                                    ? `${booking.paymentNeedsReview ? "Pagamento recebido · revisão necessária" : `Recebido ${paymentProgress.receivedPercentage}%`}: ${formatBRL(booking.receivedAmountCents)}${booking.balanceDueCents > 0 ? ` · Falta pagar ${paymentProgress.remainingPercentage}% do valor da reserva: ${formatBRL(booking.balanceDueCents)}` : " · Pago integralmente"}`
                                    : `Cobrança pendente: ${formatBRL(booking.chargeAmountCents)} · total: ${formatBRL(booking.amountCents)} · após a cobrança, restará ${formatBRL(booking.expectedBalanceDueCents)}`}
                                </p>
                              ) : !booking.isAdminManual && booking.balanceDueCents > 0 ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {booking.receivedAmountCents > 0
                                    ? "Entrada recebida"
                                    : "Entrada no checkout"}
                                  : {formatBRL(booking.chargeAmountCents)} · saldo:{" "}
                                  {formatBRL(booking.balanceDueCents)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <a
                                href={`https://wa.me/55${booking.phone}?text=${encodeURIComponent(message)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
                              >
                                <MessageCircle className="h-4 w-4" /> Contatar
                              </a>
                              {!booking.isAdminManual && booking.paymentNeedsReview && (
                                <button
                                  type="button"
                                  disabled={working === booking.code}
                                  onClick={() => act(booking, "confirm_received_payment")}
                                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-success px-4 text-sm font-bold text-success-foreground disabled:opacity-50"
                                >
                                  {working === booking.code ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}{" "}
                                  Confirmar reserva após revisão
                                </button>
                              )}
                              {booking.status === "pending" &&
                                !booking.paymentNeedsReview &&
                                !booking.isAdminManual && (
                                  <button
                                    type="button"
                                    disabled={working === booking.code}
                                    onClick={() => act(booking, "mark_paid")}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-success px-4 text-sm font-bold text-success-foreground disabled:opacity-50"
                                  >
                                    {working === booking.code ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}{" "}
                                    Confirmar pagamento
                                  </button>
                                )}
                              {(booking.status === "pending" || booking.status === "paid") && (
                                <button
                                  type="button"
                                  disabled={working === booking.code}
                                  onClick={() => act(booking, "cancel")}
                                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  <X className="h-4 w-4" /> Cancelar grupo
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
      {isMaster && (
        <dialog
          ref={manualCreateDialogRef}
          className="admin-manual-dialog"
          aria-labelledby="manual-create-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            onManualFormOpenChange?.(false);
          }}
          onClose={() => onManualFormOpenChange?.(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) onManualFormOpenChange?.(false);
          }}
        >
          <div className="admin-manual-dialog-inner">
            <header className="admin-manual-dialog-header">
              <div>
                <p>Somente Admin Master</p>
                <h2 id="manual-create-dialog-title">Nova reserva manual</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar formulário"
                onClick={() => onManualFormOpenChange?.(false)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>
            <p className="admin-manual-warning">
              O horário será bloqueado sem cobrança. Se existir checkout público em andamento, um
              pagamento validado depois precisará de revisão manual.
            </p>
            {arenaSettingsQuery.isError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Não foi possível carregar as quadras. Atualize o painel e tente novamente.
              </p>
            ) : (
              <form onSubmit={submitManualBooking} className="admin-manual-form">
                <label>
                  Nome
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Número / WhatsApp
                  <input
                    required
                    type="tel"
                    maxLength={30}
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    autoComplete="tel"
                    placeholder="(69) 99999-1234"
                  />
                </label>
                <label>
                  Unidade
                  <select
                    value={manualUnitId}
                    onChange={(event) => setManualUnitId(event.target.value as UnitId)}
                  >
                    {SITE.units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quadra
                  <select
                    required
                    value={manualSpaceId}
                    onChange={(event) => setManualSpaceId(event.target.value)}
                    disabled={arenaSettingsQuery.isLoading || manualSpaces.length === 0}
                  >
                    {manualSpaces.length ? (
                      manualSpaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name}
                        </option>
                      ))
                    ) : (
                      <option value="">Nenhuma quadra cadastrada</option>
                    )}
                  </select>
                </label>
                <label>
                  Data
                  <input
                    required
                    type="date"
                    min={arenaNow().date}
                    value={manualDate}
                    onChange={(event) => setManualDate(event.target.value)}
                  />
                </label>
                <label>
                  Início
                  <select
                    value={manualStart}
                    onChange={(event) => {
                      const nextStart = event.target.value;
                      setManualStart(nextStart);
                      if (toMin(manualEnd) <= toMin(nextStart)) {
                        setManualEnd(
                          MANUAL_END_OPTIONS.find((time) => toMin(time) > toMin(nextStart)) ??
                            "24:00",
                        );
                      }
                    }}
                  >
                    {MANUAL_START_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Término
                  <select value={manualEnd} onChange={(event) => setManualEnd(event.target.value)}>
                    {MANUAL_END_OPTIONS.filter((time) => toMin(time) > toMin(manualStart)).map(
                      (time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <div className="admin-manual-form-actions">
                  <button
                    type="button"
                    className="admin-dialog-cancel"
                    onClick={() => onManualFormOpenChange?.(false)}
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      creatingManual || arenaSettingsQuery.isLoading || manualSpaces.length === 0
                    }
                    className="admin-manual-submit"
                  >
                    {creatingManual ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    Efetuar reserva
                  </button>
                  <p className="admin-manual-submit-note">(o horário reservado será bloqueado)</p>
                </div>
              </form>
            )}
          </div>
        </dialog>
      )}
      {selectedBooking && (
        <dialog
          ref={bookingDetailsDialogRef}
          aria-labelledby="booking-details-title"
          aria-describedby="booking-details-summary"
          onCancel={(event) => {
            event.preventDefault();
            setSelectedBooking(null);
          }}
          onClose={() => setSelectedBooking(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedBooking(null);
          }}
          className="admin-booking-details-dialog"
        >
          <div className="admin-details-inner">
            <header className="admin-details-header">
              <div>
                <p>Detalhes da reserva</p>
                <h2 id="booking-details-title">{selectedBooking.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar detalhes"
                onClick={() => setSelectedBooking(null)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>
            <dl id="booking-details-summary" className="admin-details-list">
              <div>
                <dt>Data</dt>
                <dd>
                  {formatBookingDate(selectedBooking.date)} ·{" "}
                  {formatBookingWeekday(selectedBooking.date)}
                </dd>
              </div>
              <div>
                <dt>Unidade e quadra</dt>
                <dd>{selectedBooking.spaceName}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>{formatSlotRanges(selectedBooking.slots)}</dd>
              </div>
              <div>
                <dt>Contato</dt>
                <dd>{selectedBooking.phone}</dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>
                  {bookingPaymentSummary(selectedBooking)} · {selectedBooking.paymentLabel}
                </dd>
              </div>
              <div>
                <dt>Valor recebido</dt>
                <dd>
                  {selectedBooking.isAdminManual
                    ? "Sem pagamento · bloqueio manual"
                    : formatBRL(selectedBooking.receivedAmountCents)}
                </dd>
              </div>
              {selectedBooking.balanceDueCents > 0 && (
                <div>
                  <dt>Saldo pendente</dt>
                  <dd>{formatBRL(selectedBooking.balanceDueCents)}</dd>
                </div>
              )}
              <div>
                <dt>Código</dt>
                <dd>{selectedBooking.code}</dd>
              </div>
            </dl>
            <div className="admin-details-actions">
              <a
                href={`https://wa.me/55${selectedBooking.phone}?text=${encodeURIComponent(`Olá, ${selectedBooking.name.split(" ")[0]}, sobre a sua reserva na Arena Leste, ${formatBookingWeekday(selectedBooking.date)}, dia ${selectedBooking.date.split("-").reverse().join("/")}, das ${formatSlotRanges(selectedBooking.slots)}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-details-contact"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Contatar no WhatsApp
              </a>
              {selectedBooking.paymentNeedsReview && (
                <button
                  type="button"
                  onClick={() => {
                    void act(selectedBooking, "confirm_received_payment");
                    setSelectedBooking(null);
                  }}
                  className="rounded-full bg-success px-4 py-2 text-sm font-bold text-success-foreground"
                >
                  Confirmar após revisão
                </button>
              )}
              {selectedBooking.status === "pending" &&
                !selectedBooking.paymentNeedsReview &&
                !selectedBooking.isAdminManual && (
                  <button
                    type="button"
                    onClick={() => {
                      void act(selectedBooking, "mark_paid");
                      setSelectedBooking(null);
                    }}
                    className="rounded-full bg-success px-4 py-2 text-sm font-bold text-success-foreground"
                  >
                    Confirmar pagamento
                  </button>
                )}
              {(selectedBooking.status === "pending" || selectedBooking.status === "paid") && (
                <button
                  type="button"
                  onClick={() => {
                    void act(selectedBooking, "cancel");
                    setSelectedBooking(null);
                  }}
                  className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive"
                >
                  Cancelar grupo
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="admin-dialog-cancel"
              >
                Fechar
              </button>
            </div>
          </div>
        </dialog>
      )}
      <dialog
        ref={cancelDialogRef}
        aria-labelledby="cancel-confirm-title"
        aria-describedby="cancel-confirm-description"
        onCancel={(event) => {
          event.preventDefault();
          setCancelBookingToConfirm(null);
        }}
        onClose={() => setCancelBookingToConfirm(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCancelBookingToConfirm(null);
        }}
        className="m-auto w-[min(92vw,32rem)] rounded-2xl border border-orange-500/30 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-7">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {cancelBookingToConfirm?.cancellationDeadlinePassed
              ? "Prazo de cancelamento"
              : "Liberar horário"}
          </p>
          <h2 id="cancel-confirm-title" className="mt-3 font-display text-2xl font-bold">
            Confirmar cancelamento?
          </h2>
          <p
            id="cancel-confirm-description"
            className="mt-3 text-sm leading-relaxed text-muted-foreground"
          >
            {cancelBookingToConfirm?.cancellationDeadlinePassed
              ? "Esta reserva já passou do prazo permitido para cancelamento. Deseja mesmo cancelar?"
              : "Ao cancelar, todos os horários desta reserva serão liberados e anunciados no site por até 12 horas. Esta ação não estorna pagamentos; faça eventual estorno diretamente na InfinitePay."}
          </p>
          {cancelBookingToConfirm && (
            <p className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              {cancelBookingToConfirm.spaceName}
              {" · "}
              {formatBookingDate(cancelBookingToConfirm.date)}
              {" · "}
              {formatSlotRanges(cancelBookingToConfirm.slots)}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted"
              onClick={() => setCancelBookingToConfirm(null)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full bg-destructive px-5 text-sm font-bold text-destructive-foreground hover:opacity-90"
              disabled={working === cancelBookingToConfirm?.code}
              onClick={() => {
                const target = cancelBookingToConfirm;
                setCancelBookingToConfirm(null);
                if (target) void act(target, "cancel", target.cancellationDeadlinePassed, true);
              }}
            >
              {working === cancelBookingToConfirm?.code ? "Cancelando…" : "Sim, cancelar reserva"}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
