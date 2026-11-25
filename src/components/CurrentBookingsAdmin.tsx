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

const MANUAL_START_OPTIONS = Array.from({ length: 44 }, (_, index) => toHHMM(13 * 60 + index * 15));
const MANUAL_END_OPTIONS = Array.from({ length: 44 }, (_, index) =>
  toHHMM(13 * 60 + (index + 1) * 15),
);

export function CurrentBookingsAdmin({
  view = "agenda",
  isMaster = false,
}: {
  view?: "agenda" | "reservations";
  isMaster?: boolean;
}) {
  const fetchCurrentDay = useServerFn(adminCurrentDay);
  const fetchCurrentBookings = useServerFn(adminCurrentBookings);
  const fetchArenaSettings = useServerFn(adminArenaSettings);
  const createManual = useServerFn(adminCreateManualBooking);
  const updateBooking = useServerFn(adminUpdateBooking);
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => arenaNow().date);
  const [agendaMode, setAgendaMode] = useState<"day" | "week">("day");
  const [selectedBooking, setSelectedBooking] = useState<BookingGroup | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [cancelBookingToConfirm, setCancelBookingToConfirm] = useState<BookingGroup | null>(null);
  const cancelDialogRef = useRef<HTMLDialogElement>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [manualUnitId, setManualUnitId] = useState<UnitId>("unidade-1");
  const [manualSpaceId, setManualSpaceId] = useState("");
  const [manualDate, setManualDate] = useState(() => arenaNow().date);
  const [manualStart, setManualStart] = useState("13:00");
  const [manualEnd, setManualEnd] = useState("14:00");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);
  const arenaSettingsQuery = useQuery({
    queryKey: ["admin-arena-settings"],
    queryFn: () => fetchArenaSettings(),
    enabled: view === "reservations" && isMaster,
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
  const rangeStart = view === "agenda" && agendaMode === "week" ? weekStart : arenaNow().date;
  const rangeEnd = view === "agenda" && agendaMode === "week" ? weekEnd : shiftDate(rangeStart, 60);
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
                  : "Agenda semanal"
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
                  setDate((current) => shiftDate(current, agendaMode === "week" ? -7 : -1))
                }
                aria-label="Dia anterior"
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
                  setDate((current) => shiftDate(current, agendaMode === "week" ? 7 : 1))
                }
                aria-label="Próximo dia"
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
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                aria-label="Agenda semanal, domingo a sábado"
              >
                {Array.from({ length: 7 }, (_, index) => {
                  const day = shiftDate(weekStart, index);
                  const dayLabel = new Intl.DateTimeFormat("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${day}T12:00:00Z`));
                  const dayBookings = groups.filter((booking) => booking.date === day);
                  return (
                    <section
                      key={day}
                      className="min-h-32 rounded-xl border border-border bg-background p-3"
                    >
                      <h3 className="mb-2 border-b border-border pb-2 text-sm font-bold capitalize">
                        {dayLabel}
                      </h3>
                      {dayBookings.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">Sem reservas</p>
                      ) : (
                        <ul className="space-y-2">
                          {dayBookings.map((booking) => {
                            const progress = paymentProgressPercentages(
                              booking.amountCents,
                              booking.receivedAmountCents,
                            );
                            const paymentMethodLabel = booking.paymentLabel
                              .toLocaleLowerCase("pt-BR")
                              .includes("pix")
                              ? "PIX"
                              : booking.paymentLabel.includes("InfinitePay")
                                ? "InfinitePay"
                                : "Pagamento";
                            const payStatus = booking.isAdminManual
                              ? "Bloqueio manual"
                              : booking.paymentNeedsReview
                                ? "Revisar pagamento"
                                : booking.receivedAmountCents > 0
                                  ? booking.balanceDueCents > 0
                                    ? `${paymentMethodLabel} pago ${progress.receivedPercentage}% · falta ${progress.remainingPercentage}%`
                                    : `${paymentMethodLabel} · pago 100%`
                                  : STATUS_LABEL[booking.status];
                            return (
                              <li key={booking.code}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedBooking(booking)}
                                  className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                >
                                  <span className="block font-semibold">
                                    {booking.name.trim().split(/\s+/u)[0]} ·{" "}
                                    {formatSlotRanges(booking.slots)}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {booking.spaceName}
                                  </span>
                                  <span className="mt-1 block text-xs font-semibold">
                                    {payStatus}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            {view === "agenda" && agendaMode === "day" && (
              <AdminAgendaGrid
                date={date}
                bookings={agendaBookings}
                spaces={agendaData?.spaces ?? []}
                schedules={agendaData?.schedules ?? []}
              />
            )}
            {view === "reservations" && isMaster && (
              <section
                className="mb-6 rounded-2xl border border-primary/35 bg-primary/5 p-4 sm:p-5"
                aria-labelledby="manual-booking-heading"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3
                      id="manual-booking-heading"
                      className="font-display text-xl font-bold uppercase"
                    >
                      Criar reserva manual
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Exclusivo do Admin Master. O bloqueio entra na agenda imediatamente, sem criar
                      cobrança nem registrar pagamento.
                    </p>
                  </div>
                </div>
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
                  Se houver um checkout público em andamento para o mesmo horário, um pagamento
                  validado depois ficará para revisão e eventual estorno manual.
                </p>
                {arenaSettingsQuery.isError ? (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    Não foi possível carregar as quadras. Atualize a aba e tente novamente.
                  </p>
                ) : (
                  <form
                    onSubmit={submitManualBooking}
                    className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                  >
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Unidade
                      <select
                        value={manualUnitId}
                        onChange={(event) => setManualUnitId(event.target.value as UnitId)}
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
                      >
                        {SITE.units.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Quadra
                      <select
                        required
                        value={manualSpaceId}
                        onChange={(event) => setManualSpaceId(event.target.value)}
                        disabled={arenaSettingsQuery.isLoading || manualSpaces.length === 0}
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground disabled:opacity-60"
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
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Data
                      <input
                        required
                        type="date"
                        min={rangeStart}
                        value={manualDate}
                        onChange={(event) => setManualDate(event.target.value)}
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
                      >
                        {MANUAL_START_OPTIONS.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Término
                      <select
                        value={manualEnd}
                        onChange={(event) => setManualEnd(event.target.value)}
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
                      >
                        {MANUAL_END_OPTIONS.filter((time) => toMin(time) > toMin(manualStart)).map(
                          (time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Nome
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={manualName}
                        onChange={(event) => setManualName(event.target.value)}
                        autoComplete="name"
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Telefone / WhatsApp
                      <input
                        required
                        type="tel"
                        maxLength={30}
                        value={manualPhone}
                        onChange={(event) => setManualPhone(event.target.value)}
                        autoComplete="tel"
                        placeholder="(69) 99999-1234"
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground"
                      />
                    </label>
                    <div className="flex items-end sm:col-span-2 xl:col-span-4">
                      <button
                        type="submit"
                        disabled={
                          creatingManual ||
                          arenaSettingsQuery.isLoading ||
                          manualSpaces.length === 0
                        }
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                      >
                        {creatingManual ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Criar e bloquear horário
                      </button>
                    </div>
                  </form>
                )}
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
            <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
              Mostrando {filteredGroups.length} de {groups.length} reservas{" "}
              {view === "agenda" ? "nesta data" : "neste período"}.
            </p>
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
                <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 font-semibold">
                  Nenhuma reserva {view === "agenda" ? "nesta data" : "neste período"}
                </p>
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
                            {view === "reservations" ? `${formatBookingDate(booking.date)} · ` : ""}
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
                          Pagamento recebido, mas a reserva não foi confirmada automaticamente. Use
                          a confirmação após revisão somente se o horário ainda não terminou e
                          continua livre; caso contrário, contate o cliente e trate eventual estorno
                          na InfinitePay.
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
      </div>
      {selectedBooking && (
        <dialog
          open
          aria-labelledby="booking-details-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedBooking(null);
          }}
          className="fixed inset-0 z-50 m-auto max-h-[85vh] w-[min(92vw,36rem)] overflow-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/70"
        >
          <h2 id="booking-details-title" className="font-display text-2xl font-bold">
            {selectedBooking.name}
          </h2>
          <p className="mt-2 text-sm">
            {selectedBooking.phone} · {selectedBooking.code}
          </p>
          <p className="mt-1 text-sm">
            {formatBookingDate(selectedBooking.date)} · {selectedBooking.spaceName} ·{" "}
            {formatSlotRanges(selectedBooking.slots)}
          </p>
          <p className="mt-2 text-sm">
            {selectedBooking.paymentLabel} ·{" "}
            {selectedBooking.isAdminManual
              ? "Bloqueio manual"
              : selectedBooking.paymentNeedsReview
                ? "Pagamento para revisão"
                : selectedBooking.balanceDueCents > 0
                  ? `Recebido ${formatBRL(selectedBooking.receivedAmountCents)} · saldo ${formatBRL(selectedBooking.balanceDueCents)}`
                  : selectedBooking.status === "paid"
                    ? "Pago 100%"
                    : STATUS_LABEL[selectedBooking.status]}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
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
              className="rounded-full border border-border px-4 py-2 text-sm"
            >
              Fechar
            </button>
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
