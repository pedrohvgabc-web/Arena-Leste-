import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, MessageCircle, ShieldCheck, Ticket, X } from "lucide-react";
import { SITE, waLink } from "@/lib/site";
import {
  createBooking,
  getPublicPaymentConfig,
  getPublicReleasedSlotOffers,
  getAvailability,
  getPublicBookingDates,
  getSpaces,
} from "@/lib/arena.functions";
import {
  ARENA_TZ,
  arenaNow,
  calculateBookingPrice,
  calendarMonthDays,
  BOOKING_HORIZON_DAYS,
  formatDuration,
  formatBRL,
  initialPaymentCents,
  MAX_BOOKING_MINUTES,
  MAX_SLOTS,
  hasFirstAndLastName,
  normalizeFullName,
  promotionalHourlyRateCents,
  type PaymentMethod,
  type PaymentPlan,
} from "@/lib/arena-rules";
import { formatCpfInput, normalizeValidCpf } from "@/lib/customer-data";

type UnitId = "unidade-1" | "unidade-2";
type Space = {
  id: string;
  name: string;
  sport: string;
  capacity: number | null;
  slot_minutes: number;
  price_cents: number;
  active: boolean;
  unit_id: UnitId;
};
type TimeSlot = {
  start: string;
  end: string;
  status: "available" | "pending" | "confirmed" | "unavailable";
};
type BookingResult = {
  code: string;
  date: string;
  start: string;
  end: string;
  slots: Array<{ start: string; end: string }>;
  method: PaymentMethod;
  status: string;
  amount: number;
  chargeAmount: number;
  balanceDue: number;
  paymentPlan: PaymentPlan;
  promoApplied: boolean;
  expiresAt: string | null;
  firstName: string;
  space: string;
  pixPayload: string | null;
  pixSimulated: boolean;
  checkoutUrl: string | null;
};
type BookingDraft = { name: string; phone: string; cpf: string; address: string; notes: string };

const UNIT_IDS: UnitId[] = ["unidade-1", "unidade-2"];
const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "pix", label: "Pix demonstrativo · sem cobrança real" },
  { value: "card_onsite", label: "Cartão no local" },
  { value: "cash_onsite", label: "Dinheiro no local" },
];
const pad = (value: number) => String(value).padStart(2, "0");

function addDays(dateISO: string, amount: number) {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function dateLabel(dateISO: string) {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: ARENA_TZ,
  }).format(new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12)));
}
function calendarMonthLabel(monthISO: string) {
  const [year = 2026, month = 1] = monthISO.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: ARENA_TZ,
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}
function shiftMonth(monthISO: string, change: number) {
  const [year = 2026, month = 1] = monthISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + change, 1, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}
function formatSlot(slot: { start: string; end: string }) {
  const end = slot.end.slice(0, 5);
  return `${slot.start.slice(0, 5)} – ${end === "24:00" ? "00:00" : end}`;
}

function slotDurationMinutes(slot: { start: string; end: string }) {
  const [startHour, startMinute] = slot.start.split(":").map(Number);
  const [endHour, endMinute] = slot.end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

export const Route = createFileRoute("/reservar")({
  validateSearch: (search: Record<string, unknown>) => ({
    unit: UNIT_IDS.includes(search["unit"] as UnitId) ? (search["unit"] as UnitId) : undefined,
    ...(typeof search["offer"] === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search["offer"])
      ? { offer: search["offer"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Agendamento de quadras — Arena Leste Porto Velho" },
      {
        name: "description",
        content:
          "Escolha a unidade, quadra, dia e horário para reservar na Arena Leste em Porto Velho.",
      },
      { property: "og:title", content: "Agendamento de quadras — Arena Leste Porto Velho" },
      {
        property: "og:description",
        content: "Agendamento online para as quadras de areia das duas unidades.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE.name },
      { property: "og:url", content: `${SITE.url}/reservar` },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE.url}/reservar` }],
  }),
  component: Reservar,
});

function Reservar() {
  const search = Route.useSearch();
  const fetchSpaces = useServerFn(getSpaces);
  const fetchPaymentConfig = useServerFn(getPublicPaymentConfig);
  const fetchDates = useServerFn(getPublicBookingDates);
  const fetchAvailability = useServerFn(getAvailability);
  const fetchReleasedOffers = useServerFn(getPublicReleasedSlotOffers);
  const submitBooking = useServerFn(createBooking);
  const queryClient = useQueryClient();
  const [unitId, setUnitId] = useState<UnitId>(search.unit ?? "unidade-1");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [starts, setStarts] = useState<string[]>([]);
  const [releasedOfferId, setReleasedOfferId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("full");
  const [paymentPlanLocked, setPaymentPlanLocked] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<BookingDraft | null>(null);
  const [paymentSnapshot, setPaymentSnapshot] = useState<{
    durationMinutes: number;
    totalCents: number;
    chargeCents: number;
    balanceDueCents: number;
  } | null>(null);
  const paymentDialogRef = useRef<HTMLDialogElement>(null);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [promoReady, setPromoReady] = useState(false);
  const promoDialogRef = useRef<HTMLDialogElement>(null);
  const promoTriggerRef = useRef<HTMLButtonElement>(null);
  const promoReturnFocusRef = useRef<HTMLHeadingElement>(null);
  const cancellationDialogRef = useRef<HTMLDialogElement>(null);
  const [cancellationDialogOpen, setCancellationDialogOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [visibleMonth, setVisibleMonth] = useState(() => arenaNow().date.slice(0, 7));
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const appliedReleasedOfferRef = useRef<string | null>(null);

  useEffect(() => {
    setPromoReady(true);
  }, []);

  const paymentConfigQuery = useQuery({
    queryKey: ["public-payment-config"],
    queryFn: () => fetchPaymentConfig(),
    staleTime: 60_000,
    retry: false,
  });
  const releasedOffersQuery = useQuery({
    queryKey: ["public-released-slot-offers"],
    queryFn: () => fetchReleasedOffers(),
    enabled: Boolean(search.offer),
    staleTime: 10_000,
    retry: false,
  });
  const releasedOffer = useMemo(
    () => releasedOffersQuery.data?.find((offer) => offer.id === search.offer) ?? null,
    [releasedOffersQuery.data, search.offer],
  );
  useEffect(() => {
    if (!releasedOffer || appliedReleasedOfferRef.current === releasedOffer.id) return;
    appliedReleasedOfferRef.current = releasedOffer.id;
    setUnitId(releasedOffer.unitId);
    setSpaceId(releasedOffer.spaceId);
    setDate(releasedOffer.date);
    setStarts(releasedOffer.slots.map((slot) => slot.start));
    setReleasedOfferId(releasedOffer.id);
    setBookingStep(3);
    setVisibleMonth(releasedOffer.date.slice(0, 7));
  }, [releasedOffer]);
  const paymentMode = paymentConfigQuery.data?.mode ?? null;
  useEffect(() => {
    const dialog = paymentDialogRef.current;
    if (!dialog) return;
    if (paymentDialogOpen && !dialog.open) dialog.showModal();
    if (!paymentDialogOpen && dialog.open) dialog.close();
  }, [paymentDialogOpen]);
  useEffect(() => {
    const dialog = promoDialogRef.current;
    if (!dialog) return;
    if (promoDialogOpen && !dialog.open) dialog.showModal();
    if (!promoDialogOpen && dialog.open) dialog.close();
  }, [promoDialogOpen]);
  useEffect(() => {
    const dialog = cancellationDialogRef.current;
    if (!dialog) return;
    if (cancellationDialogOpen && !dialog.open) dialog.showModal();
    if (!cancellationDialogOpen && dialog.open) dialog.close();
  }, [cancellationDialogOpen]);
  const paymentMethods = METHODS.map((method) =>
    method.value !== "pix"
      ? method
      : {
          ...method,
          label:
            paymentMode === "infinitepay"
              ? "Pix ou cartão · InfinitePay"
              : paymentMode === "unavailable"
                ? "Pix ou cartão · indisponível"
                : paymentMode === "demo"
                  ? "Pix demonstrativo · sem cobrança real"
                  : "Verificando checkout…",
        },
  );

  const spacesQuery = useQuery({
    queryKey: ["booking-spaces"],
    queryFn: () => fetchSpaces(),
    staleTime: 5_000,
    retry: false,
  });
  const spaces = useMemo(() => (spacesQuery.data ?? []) as Space[], [spacesQuery.data]);
  const unitSpaces = useMemo(
    () => spaces.filter((space) => space.unit_id === unitId),
    [spaces, unitId],
  );
  const selectedSpace = unitSpaces.find((space) => space.id === spaceId) ?? null;

  useEffect(() => {
    if (spacesQuery.isLoading) return;
    if (!unitSpaces.length) {
      setSpaceId(null);
      return;
    }
    if (!unitSpaces.some((space) => space.id === spaceId)) setSpaceId(unitSpaces[0]!.id);
  }, [spacesQuery.isLoading, unitSpaces, spaceId]);

  const datesQuery = useQuery({
    queryKey: ["booking-dates", unitId],
    queryFn: () => fetchDates({ data: { unitId } }),
    staleTime: 120_000,
    retry: false,
  });
  const openDates = useMemo(() => datesQuery.data ?? [], [datesQuery.data]);
  const openDateSet = useMemo(() => new Set(openDates), [openDates]);
  const todayDate = arenaNow().date;
  const firstCalendarMonth = todayDate.slice(0, 7);
  const lastCalendarMonth = addDays(todayDate, BOOKING_HORIZON_DAYS).slice(0, 7);
  const calendarDays = useMemo(() => calendarMonthDays(visibleMonth), [visibleMonth]);
  const availabilityQuery = useQuery({
    queryKey: ["booking-availability", spaceId, date],
    queryFn: () => fetchAvailability({ data: { spaceId: spaceId!, date: date! } }),
    enabled: Boolean(spaceId && date),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  const slots = useMemo(
    () => (availabilityQuery.data ?? []) as TimeSlot[],
    [availabilityQuery.data],
  );
  const selectedSlots = slots.filter(
    // Keep the customer's selection stable while availability refreshes. The server
    // performs the final conflict check when the reservation is submitted.
    (slot) => starts.includes(slot.start),
  );
  const selectedDurationMinutes = selectedSlots.reduce(
    (total, slot) => total + slotDurationMinutes(slot),
    0,
  );
  useEffect(() => {
    if (availabilityQuery.isLoading || availabilityQuery.isFetching) return;
    const available = new Set(slots.map((slot) => slot.start));
    setStarts((current) => {
      const next = current.filter((value) => available.has(value));
      return next.length === current.length ? current : next;
    });
  }, [availabilityQuery.isFetching, availabilityQuery.isLoading, slots]);
  useEffect(() => {
    if (paymentMode === "unavailable" && paymentMethod === "pix") {
      setPaymentMethod("card_onsite");
    }
  }, [paymentMode, paymentMethod]);
  const unit = SITE.units.find((item) => item.id === unitId)!;
  const pricing = selectedSpace
    ? calculateBookingPrice(
        selectedSpace.price_cents,
        selectedSpace.slot_minutes,
        selectedSlots.length,
        date ?? undefined,
        paymentMethod,
        selectedDurationMinutes,
        selectedSlots.map((slot) => slot.start),
      )
    : null;
  const maxSelectableSlots = Math.min(
    MAX_SLOTS,
    Math.floor(MAX_BOOKING_MINUTES / (selectedSpace?.slot_minutes ?? 60)),
  );
  const regularHourlyRateCents = selectedSpace
    ? Math.round((selectedSpace.price_cents * 60) / selectedSpace.slot_minutes)
    : 5_000;
  const promoRate = promotionalHourlyRateCents(
    date ?? undefined,
    paymentMethod,
    selectedDurationMinutes,
    selectedSlots.map((slot) => slot.start),
    selectedSpace?.slot_minutes ?? 60,
  );
  const promoAvailable = promoRate !== null;
  const promoHourlyRateCents = promoRate ?? regularHourlyRateCents;
  const appliedHourlyRateCents = pricing?.promoApplied
    ? promoHourlyRateCents
    : regularHourlyRateCents;
  const totalCents = pricing?.totalCents ?? 0;
  const chargeCents = initialPaymentCents(totalCents, paymentPlan);
  const balanceDueCents = Math.max(0, totalCents - chargeCents);
  const paymentDuration = paymentSnapshot?.durationMinutes ?? selectedDurationMinutes;
  const paymentTotal = paymentSnapshot?.totalCents ?? totalCents;
  const paymentCharge = paymentSnapshot
    ? initialPaymentCents(paymentTotal, paymentPlan)
    : chargeCents;
  const paymentBalance = paymentSnapshot
    ? Math.max(0, paymentTotal - paymentCharge)
    : balanceDueCents;
  const releasedOfferUnavailable =
    Boolean(search.offer && !releasedOffer && !releasedOffersQuery.isLoading) ||
    Boolean(
      releasedOfferId &&
      !availabilityQuery.isLoading &&
      !availabilityQuery.isFetching &&
      selectedSlots.length !== starts.length,
    );

  function resetIdempotency() {
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setError(null);
  }
  function chooseUnit(nextUnit: UnitId) {
    if (nextUnit === unitId) return;
    setUnitId(nextUnit);
    setSpaceId(null);
    setDate(null);
    setCalendarExpanded(true);
    setStarts([]);
    resetIdempotency();
  }
  function chooseCourt(id: string) {
    if (id === spaceId) return;
    setSpaceId(id);
    setDate(null);
    setCalendarExpanded(true);
    setStarts([]);
    resetIdempotency();
  }
  function chooseDate(nextDate: string) {
    setDate(nextDate);
    setVisibleMonth(nextDate.slice(0, 7));
    setCalendarExpanded(false);
    setStarts([]);
    resetIdempotency();
  }
  function chooseTime(nextStart: string) {
    if (starts.includes(nextStart)) {
      setStarts((current) => current.filter((value) => value !== nextStart));
    } else {
      const nextSlot = slots.find((slot) => slot.start === nextStart);
      const currentDuration = starts.reduce((total, start) => {
        const slot = slots.find((item) => item.start === start);
        return total + (slot ? slotDurationMinutes(slot) : 0);
      }, 0);
      if (
        !nextSlot ||
        starts.length >= maxSelectableSlots ||
        currentDuration + slotDurationMinutes(nextSlot) > MAX_BOOKING_MINUTES
      ) {
        setError("Você pode reservar até 16 horas por pedido.");
        return;
      }
      setStarts((current) =>
        current.includes(nextStart) ? current : [...current, nextStart].sort(),
      );
    }
    resetIdempotency();
  }

  function goToBookingStep(nextStep: number) {
    setBookingStep(nextStep);
    setError(null);
    requestAnimationFrame(() => {
      const step = document.querySelector<HTMLElement>(`[data-booking-step-focus="${nextStep}"]`);
      if (!step) return;
      step.focus({ preventScroll: true });
      step.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function continueBookingStep() {
    if (bookingStep === 1 && !selectedSpace) {
      setError("Escolha uma quadra disponível para continuar.");
      return;
    }
    if (bookingStep === 2 && !date) {
      setError("Escolha um dia aberto para carregar os horários.");
      return;
    }
    if (bookingStep === 2 && !selectedSlots.length) {
      setError("Escolha pelo menos um horário livre para continuar.");
      return;
    }
    goToBookingStep(Math.min(3, bookingStep + 1));
  }

  function closePromo() {
    const dialog = promoDialogRef.current;
    if (dialog?.open) dialog.close();
    else dismissPromo();
  }

  function dismissPromo() {
    setPromoDialogOpen(false);
    requestAnimationFrame(() => promoReturnFocusRef.current?.focus({ preventScroll: true }));
  }

  function continueAfterCancellationNotice() {
    cancellationDialogRef.current?.close();
    setCancellationDialogOpen(false);
    if (!selectedSlots.length || !totalCents || !selectedDurationMinutes) {
      setError("Os horários selecionados não puderam ser confirmados. Volte e escolha novamente.");
      return;
    }
    if (paymentMethod === "pix" && paymentMode === "infinitepay") {
      setPaymentPlan("full");
      setPaymentPlanLocked(false);
      setPaymentSnapshot({
        durationMinutes: selectedDurationMinutes,
        totalCents,
        chargeCents: totalCents,
        balanceDueCents: 0,
      });
      setPaymentDialogOpen(true);
      return;
    }
    if (pendingDraft) void submitDraft(pendingDraft, "full");
  }

  async function finishBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpace || !date || !selectedSlots.length) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = normalizeFullName(String(form.get("name") ?? ""));
    if (!hasFirstAndLastName(name)) {
      setError("Informe seu nome e sobrenome para continuar.");
      const nameInput = formElement.elements.namedItem("name");
      if (nameInput instanceof HTMLInputElement) nameInput.focus();
      return;
    }
    const cpf = normalizeValidCpf(String(form.get("cpf") ?? ""));
    if (!cpf) {
      setError("Confira o CPF informado.");
      return;
    }
    const address = String(form.get("address") ?? "").trim();
    if (address.length < 8) {
      setError("Informe o endereço completo.");
      return;
    }
    if (form.get("privacyConsent") !== "on") {
      setError("Confirme o uso dos dados para continuar.");
      return;
    }
    const draft: BookingDraft = {
      name,
      phone: String(form.get("phone") ?? ""),
      cpf,
      address,
      notes: String(form.get("notes") ?? ""),
    };
    setPendingDraft(draft);
    setError(null);
    setCancellationDialogOpen(true);
  }

  async function submitDraft(draft: BookingDraft, selectedPlan: PaymentPlan) {
    if (
      !selectedSpace ||
      !date ||
      !selectedSlots.length ||
      !totalCents ||
      !selectedDurationMinutes
    ) {
      setError("Escolha pelo menos um horário válido antes de seguir para o pagamento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitBooking({
        data: {
          unitId,
          spaceId: selectedSpace.id,
          date,
          starts: selectedSlots.map((slot) => slot.start),
          name: draft.name,
          phone: draft.phone,
          cpf: draft.cpf,
          address: draft.address,
          privacyConsent: true,
          notes: draft.notes,
          method: paymentMethod,
          paymentPlan: selectedPlan,
          releasedOfferId: releasedOfferId ?? undefined,
          idempotencyKey,
        },
      });
      if (!result.ok) {
        setError(result.error);
        if ("existingPaymentPlan" in result) {
          setPaymentPlan(result.existingPaymentPlan);
          setPaymentPlanLocked(true);
        }
        await queryClient.invalidateQueries({ queryKey: ["booking-availability", spaceId, date] });
        await queryClient.invalidateQueries({ queryKey: ["public-released-slot-offers"] });
        return;
      }
      const createdBooking = result.booking as BookingResult;
      await queryClient.invalidateQueries({ queryKey: ["public-released-slot-offers"] });
      setBooking(createdBooking);
      setPaymentDialogOpen(false);
      if (createdBooking.checkoutUrl) window.location.assign(createdBooking.checkoutUrl);
    } catch {
      setError("Não foi possível concluir agora. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function startNewBooking() {
    setBooking(null);
    setUnitId(search.unit ?? "unidade-1");
    setSpaceId(null);
    setDate(null);
    setStarts([]);
    setReleasedOfferId(null);
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setPaymentPlan("full");
    setPaymentPlanLocked(false);
    setPendingDraft(null);
    setPaymentSnapshot(null);
    setPaymentDialogOpen(false);
    setCancellationDialogOpen(false);
    setBookingStep(1);
    setVisibleMonth(arenaNow().date.slice(0, 7));
  }

  const contactMessage = booking
    ? `Olá! Acabei de fazer uma reserva online na ${SITE.shortName}. Código ${booking.code}; ${booking.space}; ${booking.date.split("-").reverse().join("/")}; horários ${booking.slots.map(formatSlot).join(", ")}. Gostaria de tirar uma dúvida.`
    : "";

  return (
    <div id="vRes" className="res">
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
        <span className="mono">Arena Leste · Reservar</span>
        <h1 ref={promoReturnFocusRef} className="rt" tabIndex={-1}>
          Reserve
          <br />
          <b>sua quadra</b>
        </h1>

        {releasedOfferUnavailable ? (
          <div
            className="mb-5 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm"
            role="alert"
          >
            <strong>Este horário acabou de ser reservado ou a oferta expirou.</strong>
            <p className="mt-1">Escolha outro horário que ainda esteja livre.</p>
            <Link
              to="/reservar"
              search={{ unit: releasedOffer?.unitId ?? search.unit ?? "unidade-1" }}
              className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 font-bold text-primary-foreground"
            >
              Ver horários disponíveis
            </Link>
          </div>
        ) : releasedOfferId && releasedOffer ? (
          <div className="mb-5 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm">
            <strong>Horário liberado pré-selecionado</strong>
            <p className="mt-1">
              {releasedOffer.spaceName} · {dateLabel(releasedOffer.date)} ·{" "}
              {releasedOffer.slots.map(formatSlot).join(", ")}. Confira os dados e conclua sua
              reserva.
            </p>
          </div>
        ) : null}

        {!booking && promoReady && (
          <button
            ref={promoTriggerRef}
            type="button"
            className="booking-promo"
            aria-haspopup="dialog"
            aria-expanded={promoDialogOpen}
            aria-label="Ver a promoção e as tarifas da Arena Leste"
            onClick={() => setPromoDialogOpen(true)}
          >
            <strong>VER A</strong>
            <span>PROMOÇÃO</span>
            <small>TARIFAS</small>
          </button>
        )}

        {booking ? (
          <BookingConfirmation
            booking={booking}
            onNewBooking={startNewBooking}
            helpMessage={contactMessage}
          />
        ) : (
          <form className="rv" onSubmit={finishBooking}>
            <div className="booking-flow">
              <fieldset
                data-booking-step="1"
                data-booking-step-focus="1"
                data-active={bookingStep === 1}
                tabIndex={-1}
                disabled={Boolean(releasedOfferId)}
              >
                <legend className="mono">1 · Unidade e quadra</legend>
                <div className="opts">
                  {SITE.units.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      className="uc"
                      aria-pressed={unitId === option.id}
                      onClick={() => chooseUnit(option.id as UnitId)}
                    >
                      <b>{index === 0 ? "Cuniã" : "Pinheiro Machado"}</b>
                      <span>{option.address}</span>
                      <em>Quadras de areia · Vôlei de praia · Futevôlei</em>
                    </button>
                  ))}
                </div>
                <div className="courtselect">
                  <span className="mono">Escolha a quadra</span>
                  {spacesQuery.isLoading ? (
                    <p className="hint">
                      <LoaderCircle size={16} className="loading-icon" /> Carregando quadras…
                    </p>
                  ) : spacesQuery.isError ? (
                    <div className="hint" role="alert">
                      <p>Não foi possível carregar as quadras.</p>
                      <button
                        type="button"
                        className="btn"
                        disabled={spacesQuery.isFetching}
                        onClick={() => void spacesQuery.refetch()}
                      >
                        {spacesQuery.isFetching ? "Tentando novamente…" : "Tentar novamente"}
                      </button>
                    </div>
                  ) : unitSpaces.length ? (
                    <div className="opts">
                      {unitSpaces.map((space) => (
                        <button
                          key={space.id}
                          type="button"
                          className="opt"
                          aria-pressed={space.id === spaceId}
                          onClick={() => chooseCourt(space.id)}
                        >
                          {space.name}
                          <small>
                            {formatBRL(space.price_cents)} · {space.slot_minutes} min
                          </small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint" role="status">
                      Esta unidade ainda não tem quadras ativas com preço. No Admin, marque “Ativa
                      para reserva” e toque em “Salvar e liberar na reserva”.
                    </p>
                  )}
                </div>
              </fieldset>

              <fieldset
                data-booking-step="2"
                data-booking-step-focus="2"
                data-active={bookingStep === 2}
                tabIndex={-1}
                className={!selectedSpace ? "lk" : ""}
                disabled={!selectedSpace || Boolean(releasedOfferId)}
              >
                <legend className="mono">2 · Data e horários</legend>
                {date && !calendarExpanded ? (
                  <div className="booking-date-summary">
                    <p className="booking-date-summary__label">
                      <strong>{dateLabel(date)}</strong>
                      <span>{selectedSpace?.name ?? "Quadra selecionada"}</span>
                    </p>
                    <button
                      type="button"
                      className="btn"
                      aria-controls="booking-calendar"
                      onClick={() => setCalendarExpanded(true)}
                    >
                      Alterar data
                    </button>
                  </div>
                ) : datesQuery.isLoading ? (
                  <p className="hint">
                    <LoaderCircle size={16} className="loading-icon" /> Consultando dias abertos…
                  </p>
                ) : datesQuery.isError ? (
                  <div className="hint" role="alert">
                    <p>Não foi possível consultar a agenda.</p>
                    <button
                      type="button"
                      className="btn"
                      disabled={datesQuery.isFetching}
                      onClick={() => void datesQuery.refetch()}
                    >
                      {datesQuery.isFetching ? "Tentando novamente…" : "Tentar novamente"}
                    </button>
                  </div>
                ) : openDates.length ? (
                  <div className="booking-calendar" id="booking-calendar">
                    <div className="booking-calendar__header">
                      <button
                        type="button"
                        className="booking-calendar__nav"
                        aria-label="Mês anterior"
                        disabled={visibleMonth <= firstCalendarMonth}
                        onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))}
                      >
                        ‹
                      </button>
                      <strong aria-live="polite">{calendarMonthLabel(visibleMonth)}</strong>
                      <button
                        type="button"
                        className="booking-calendar__nav"
                        aria-label="Próximo mês"
                        disabled={visibleMonth >= lastCalendarMonth}
                        onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}
                      >
                        ›
                      </button>
                    </div>
                    <p className="booking-calendar__range">
                      Agenda aberta até {dateLabel(addDays(todayDate, BOOKING_HORIZON_DAYS))}.
                    </p>
                    <div className="booking-calendar__weekdays" aria-hidden="true">
                      {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="booking-calendar__grid">
                      {calendarDays.map((calendarDate, index) =>
                        calendarDate ? (
                          <button
                            key={calendarDate}
                            type="button"
                            className="booking-calendar__day"
                            disabled={!openDateSet.has(calendarDate)}
                            aria-label={dateLabel(calendarDate)}
                            aria-pressed={date === calendarDate}
                            onClick={() => chooseDate(calendarDate)}
                          >
                            {Number(calendarDate.slice(-2))}
                          </button>
                        ) : (
                          <span key={`empty-${visibleMonth}-${index}`} aria-hidden="true" />
                        ),
                      )}
                    </div>
                    <p className="booking-calendar__legend">
                      Dias destacados estão abertos; os demais não têm grade disponível.
                    </p>
                    {date && (
                      <button
                        type="button"
                        className="btn booking-calendar__hide"
                        onClick={() => setCalendarExpanded(false)}
                      >
                        Ocultar calendário
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="hint">Nenhum dia aberto está configurado para esta unidade.</p>
                )}
              </fieldset>

              <aside
                className="booking-promo-summary"
                data-booking-step="2"
                data-active={bookingStep === 2}
                aria-labelledby="booking-promo-summary-title"
              >
                <div className="booking-promo-summary__inner">
                  <div className="booking-promo-summary__icon" aria-hidden="true">
                    <Ticket size={21} />
                  </div>
                  <div className="booking-promo-summary__copy">
                    <span className="booking-promo-summary__eyebrow">VANTAGEM ARENA LESTE</span>
                    <h3 id="booking-promo-summary-title">
                      Não perca essa oportunidade: aproveite a promoção!
                    </h3>
                    <p>
                      Reserve mais de 2 horas e pague <strong>R$ 40/h de domingo a quarta</strong>{" "}
                      ou <strong>R$ 45/h de quinta a sábado</strong>, no Pix ou dinheiro.
                    </p>
                    <p className="booking-promo-summary__note">
                      Para exatamente 2h: quinta a sábado, 19h–21h ou 21h–23h por R$ 90 no Pix ou
                      dinheiro.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="booking-promo-summary__button"
                    onClick={() => setPromoDialogOpen(true)}
                    aria-haspopup="dialog"
                    aria-controls="booking-promo-dialog"
                    aria-expanded={promoDialogOpen}
                  >
                    Ver faixas e regras
                  </button>
                </div>
              </aside>

              <div
                className="booking-hours-row"
                data-booking-step="2"
                data-active={bookingStep === 2}
              >
                <fieldset
                  data-booking-step="2"
                  data-active={bookingStep === 2}
                  tabIndex={-1}
                  className={!date ? "lk" : ""}
                  disabled={!date || Boolean(releasedOfferId)}
                >
                  <legend className="mono">
                    Horários · até {maxSelectableSlots} blocos (16h máx.)
                  </legend>
                  {availabilityQuery.isLoading ? (
                    <p className="hint">
                      <LoaderCircle size={16} className="loading-icon" /> Consultando horários…
                    </p>
                  ) : availabilityQuery.isError ? (
                    <div className="hint" role="alert">
                      <p>Não foi possível consultar os horários deste dia.</p>
                      <button
                        type="button"
                        className="btn"
                        disabled={availabilityQuery.isFetching}
                        onClick={() => void availabilityQuery.refetch()}
                      >
                        {availabilityQuery.isFetching ? "Tentando novamente…" : "Tentar novamente"}
                      </button>
                    </div>
                  ) : !date ? (
                    <p className="hint">Escolha um dia aberto acima para carregar os horários.</p>
                  ) : slots.length ? (
                    <div className="opts">
                      {slots.map((slot) => {
                        const available = slot.status === "available";
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            className="opt"
                            disabled={!available || Boolean(releasedOfferId)}
                            aria-pressed={starts.includes(slot.start) && available}
                            onClick={() => chooseTime(slot.start)}
                          >
                            {formatSlot(slot)}
                            <small>
                              {!available
                                ? "indisponível"
                                : starts.includes(slot.start)
                                  ? "selecionado"
                                  : "livre · selecionar"}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="hint">
                      Sem horários disponíveis para esta data. Escolha outro dia.
                    </p>
                  )}
                </fieldset>

                <a
                  className="mono booking-help booking-hours-help booking-hours-help--whatsapp"
                  href={waLink("Olá! Quero negociar um horário diferenciado.")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Quero negociar um horário diferenciado</span>
                  <svg
                    className="booking-hours-whatsapp-icon"
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M16 3.2A12.8 12.8 0 0 0 5 22.5l-1.7 6.3 6.5-1.7A12.8 12.8 0 1 0 16 3.2Z" />
                    <path
                      className="booking-hours-whatsapp-handset"
                      d="M21.1 18.2c-.28-.14-1.65-.81-1.9-.9-.26-.1-.44-.14-.62.14-.18.28-.72.9-.88 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.43-2.24-1.38-.83-.74-1.38-1.63-1.54-1.91-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.18-.28.27-.46.09-.18.05-.35-.02-.49-.07-.14-.62-1.51-.85-2.06-.22-.54-.45-.47-.62-.48h-.53c-.18 0-.49.07-.75.35-.25.28-.98.96-.98 2.34s1.01 2.72 1.15 2.91c.14.18 1.98 3.02 4.79 4.24.67.29 1.19.46 1.6.59.67.21 1.27.18 1.75.11.54-.08 1.64-.67 1.87-1.29.23-.63.23-1.17.16-1.29-.07-.12-.25-.19-.53-.33Z"
                    />
                  </svg>
                </a>
              </div>

              <fieldset
                data-booking-step="3"
                data-active={bookingStep === 3}
                tabIndex={-1}
                className={!selectedSlots.length ? "lk" : ""}
                disabled={!selectedSlots.length}
              >
                <legend className="mono">3 · Seus dados</legend>
                <div className="g2 f">
                  <label>
                    <span className="mono">Nome e sobrenome do responsável</span>
                    <input
                      name="name"
                      required
                      minLength={3}
                      maxLength={80}
                      autoComplete="name"
                      autoCapitalize="words"
                      pattern="\S+\s+\S+.*"
                      title="Informe seu nome e pelo menos um sobrenome."
                      placeholder="Ex.: Ana Silva"
                    />
                  </label>
                  <label>
                    <span className="mono">WhatsApp</span>
                    <input
                      name="phone"
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={30}
                      placeholder="(69) 9…"
                    />
                  </label>
                </div>
                <div className="g2 f booking-extra">
                  <label>
                    <span className="mono">CPF</span>
                    <input
                      name="cpf"
                      required
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                      placeholder="000.000.000-00"
                      onChange={(event) => {
                        event.currentTarget.value = formatCpfInput(event.currentTarget.value);
                      }}
                    />
                  </label>
                  <label>
                    <span className="mono">Endereço completo</span>
                    <input
                      name="address"
                      required
                      minLength={8}
                      maxLength={250}
                      autoComplete="street-address"
                      placeholder="Rua, número, bairro e cidade"
                    />
                  </label>
                </div>
                <div className="g2 f booking-extra">
                  <label>
                    <span className="mono">Atividade principal</span>
                    <input value="Vôlei de praia e futevôlei" readOnly />
                  </label>
                  <label>
                    <span className="mono">Pagamento</span>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                    >
                      {paymentMethods.map((method) => (
                        <option
                          key={method.value}
                          value={method.value}
                          disabled={
                            method.value === "pix" &&
                            paymentMode !== "demo" &&
                            paymentMode !== "infinitepay"
                          }
                        >
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    <span className="mono">Observação (opcional)</span>
                    <textarea
                      name="notes"
                      maxLength={500}
                      rows={3}
                      placeholder="Outra atividade apropriada para quadra de areia? Conte para a Arena."
                    />
                  </label>
                </div>
                <p className="hint">
                  <ShieldCheck size={15} /> Nome, WhatsApp, CPF e endereço ajudam a identificar e
                  administrar sua reserva.{" "}
                  {paymentMode === "infinitepay"
                    ? "Nome e WhatsApp podem ser pré-preenchidos no checkout. A InfinitePay ainda pode pedir confirmação de contato; CPF e endereço ficam somente com a Arena."
                    : paymentMode === "unavailable"
                      ? "O checkout online está indisponível; escolha pagamento no local."
                      : paymentMode === "demo"
                        ? "O Pix é demonstrativo, sem cobrança real."
                        : "Aguarde a verificação do pagamento online antes de selecionar Pix/cartão."}
                </p>
                {paymentConfigQuery.isError && (
                  <p role="status" className="booking-error">
                    Não foi possível verificar o checkout agora. O pagamento local continua
                    disponível; atualize a página para tentar Pix/cartão.
                  </p>
                )}
                <div className="booking-consent-block">
                  <label className="booking-consent">
                    <input type="checkbox" name="privacyConsent" required />
                    <span>
                      Autorizo o uso dos dados para administrar esta reserva. Se eu escolher
                      InfinitePay, nome e WhatsApp podem ser enviados para pré-preencher o checkout;
                      CPF e endereço não são enviados.
                    </span>
                  </label>
                  <p className="booking-privacy-copy">
                    Veja como tratamos essas informações na{" "}
                    <Link to="/privacidade">Política de Privacidade</Link>.
                  </p>
                </div>
              </fieldset>
            </div>

            <nav className="booking-mobile-controls" aria-label="Etapas da reserva">
              <div className="booking-mobile-controls__progress">
                <span>Etapa {bookingStep} de 3</span>
                <div aria-hidden="true">
                  {[1, 2, 3].map((step) => (
                    <i key={step} data-complete={step <= bookingStep} />
                  ))}
                </div>
              </div>
              {error && (
                <p className="booking-error" role="alert">
                  {error}
                </p>
              )}
              <p className="booking-mobile-controls__summary">
                {selectedSpace?.name ?? "Escolha uma quadra"}
                {selectedSlots.length ? ` · ${formatDuration(selectedDurationMinutes)}` : ""}
                <strong>{formatBRL(totalCents)}</strong>
              </p>
              {bookingStep === 1 && !selectedSpace && (
                <p
                  id="booking-next-guidance"
                  className="booking-mobile-controls__guidance"
                  role="status"
                >
                  Escolha uma quadra para liberar a próxima etapa.
                </p>
              )}
              {bookingStep === 2 && (!date || !selectedSlots.length) && (
                <p
                  id="booking-next-guidance"
                  className="booking-mobile-controls__guidance"
                  role="status"
                >
                  {!date
                    ? "Escolha uma data aberta para ver os horários."
                    : "Escolha pelo menos um horário disponível para continuar."}
                </p>
              )}
              <div className="booking-mobile-controls__actions">
                {bookingStep > 1 && !releasedOfferId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => goToBookingStep(bookingStep - 1)}
                  >
                    Voltar
                  </button>
                )}
                {bookingStep < 3 ? (
                  <button
                    type="button"
                    className="btn pri lg"
                    disabled={
                      (bookingStep === 1 && !selectedSpace) ||
                      (bookingStep === 2 && (!date || !selectedSlots.length))
                    }
                    aria-describedby={
                      (bookingStep === 1 && !selectedSpace) ||
                      (bookingStep === 2 && (!date || !selectedSlots.length))
                        ? "booking-next-guidance"
                        : undefined
                    }
                    onClick={continueBookingStep}
                  >
                    {bookingStep === 1 ? "Escolher dia e horários" : "Continuar com meus dados"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn pri lg"
                    disabled={
                      releasedOfferUnavailable ||
                      !selectedSlots.length ||
                      busy ||
                      (paymentMethod === "pix" &&
                        paymentMode !== "demo" &&
                        paymentMode !== "infinitepay")
                    }
                  >
                    {busy ? "Registrando…" : "Concluir reserva"}
                  </button>
                )}
              </div>
            </nav>

            <aside className="rs booking-desktop-summary" aria-live="polite">
              <span className="mono">Resumo</span>
              <h3>{unit.name}</h3>
              <p>{unit.address}</p>
              <div className="summaryline">
                <span>Quadra</span>
                <b>{selectedSpace?.name ?? "Escolha uma quadra"}</b>
              </div>
              <div className="summaryline">
                <span>Dia</span>
                <b>{date ? dateLabel(date) : "Escolha uma data"}</b>
              </div>
              <div className="summaryline">
                <span>Duração selecionada</span>
                <b>
                  {selectedSlots.length
                    ? `${formatDuration(selectedDurationMinutes)} (${selectedSlots.length} ${selectedSlots.length === 1 ? "bloco" : "blocos"}) · ${selectedSlots.map(formatSlot).join(", ")}`
                    : "Selecione um ou mais horários"}
                </b>
              </div>
              <div className="summarytotal">
                <span>
                  Total da reserva
                  {selectedSlots.length
                    ? ` · ${formatDuration(selectedDurationMinutes)} · ${formatBRL(appliedHourlyRateCents)}/h${pricing?.promoApplied ? " promocional" : ""}`
                    : ""}
                </span>
                <b>{formatBRL(totalCents)}</b>
              </div>
              {error && (
                <p className="booking-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="btn pri lg"
                type="submit"
                disabled={
                  !selectedSlots.length ||
                  releasedOfferUnavailable ||
                  busy ||
                  (paymentMethod === "pix" &&
                    paymentMode !== "demo" &&
                    paymentMode !== "infinitepay")
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle size={17} className="loading-icon" /> Registrando…
                  </>
                ) : (
                  "Concluir reserva"
                )}
              </button>
              <small className="mono">A reserva é registrada online. O WhatsApp é opcional.</small>
              {!selectedSpace && (
                <a
                  className="mono booking-help"
                  href={waLink(
                    "Olá! Gostaria de saber quando os horários da Arena Leste estarão disponíveis.",
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tirar dúvida pelo WhatsApp ↗
                </a>
              )}
            </aside>
          </form>
        )}
        <dialog
          ref={cancellationDialogRef}
          className="booking-cancel-dialog"
          aria-labelledby="booking-cancel-title"
          aria-describedby="booking-cancel-description"
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            setCancellationDialogOpen(false);
          }}
          onClose={() => setCancellationDialogOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setCancellationDialogOpen(false);
          }}
        >
          <span className="mono">CANCELAMENTO</span>
          <h2 id="booking-cancel-title">Aviso rápido</h2>
          <div className="booking-cancel-callout" role="note">
            <span className="booking-cancel-callout__badge" aria-hidden="true">
              24h
            </span>
            <p id="booking-cancel-description">
              Depois do prazo de 24 horas, não é possível mais cancelar a sua reserva
            </p>
          </div>
          <div className="booking-payment-dialog__actions">
            <button type="button" className="btn" onClick={() => setCancellationDialogOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn pri lg"
              autoFocus
              onClick={continueAfterCancellationNotice}
            >
              Entendi, continuar
            </button>
          </div>
        </dialog>
        <dialog
          ref={paymentDialogRef}
          className="booking-payment-dialog"
          aria-labelledby="booking-payment-title"
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setPaymentDialogOpen(false);
          }}
          onClose={() => setPaymentDialogOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setPaymentDialogOpen(false);
          }}
        >
          <div className="booking-payment-dialog__top">
            <span className="mono">Última etapa · pagamento seguro</span>
            <button
              type="button"
              className="booking-payment-dialog__close"
              onClick={() => setPaymentDialogOpen(false)}
              disabled={busy}
              aria-label="Fechar escolha de pagamento"
            >
              ×
            </button>
          </div>
          <h2 id="booking-payment-title">Como prefere pagar?</h2>
          <p className="booking-payment-dialog__intro">
            {formatDuration(paymentDuration)} · Total da reserva:{" "}
            <strong>{formatBRL(paymentTotal)}</strong>
          </p>
          <fieldset className="booking-payment-choices" disabled={busy || paymentPlanLocked}>
            <legend className="sr-only">Escolha quanto pagar agora</legend>
            <label className="booking-payment-choice">
              <input
                type="radio"
                name="booking-payment-plan"
                value="deposit_30"
                checked={paymentPlan === "deposit_30"}
                onChange={() => setPaymentPlan("deposit_30")}
              />
              <span>
                <strong>Entrada · 30%</strong>
                <b>{formatBRL(initialPaymentCents(paymentTotal, "deposit_30"))}</b>
                <small>
                  Saldo após a entrada:{" "}
                  {formatBRL(paymentTotal - initialPaymentCents(paymentTotal, "deposit_30"))}
                </small>
              </span>
            </label>
            <label className="booking-payment-choice">
              <input
                type="radio"
                name="booking-payment-plan"
                value="full"
                checked={paymentPlan === "full"}
                onChange={() => setPaymentPlan("full")}
              />
              <span>
                <strong>Pagar valor integral</strong>
                <b>{formatBRL(paymentTotal)}</b>
                <small>Quita o total da reserva nesta cobrança.</small>
              </span>
            </label>
          </fieldset>
          <p className="booking-payment-dialog__note">
            A cobrança de {formatBRL(paymentCharge)} será gerada pela InfinitePay.
            {paymentBalance > 0
              ? ` O saldo de ${formatBRL(paymentBalance)} não será incluído nesta cobrança inicial.`
              : " Esta opção paga o total informado."}
          </p>
          {paymentPlanLocked && (
            <p className="booking-payment-dialog__note">
              A reserva já foi registrada com este plano. Mantenha a mesma opção para tentar abrir o
              checkout novamente.
            </p>
          )}
          {error && (
            <p className="booking-error" role="alert">
              {error}
            </p>
          )}
          <div className="booking-payment-dialog__actions">
            <button
              type="button"
              className="btn"
              onClick={() => setPaymentDialogOpen(false)}
              disabled={busy}
            >
              Voltar
            </button>
            <button
              type="button"
              className="btn pri lg"
              disabled={busy || !pendingDraft}
              onClick={() => pendingDraft && void submitDraft(pendingDraft, paymentPlan)}
            >
              {busy ? (
                <>
                  <LoaderCircle size={17} className="loading-icon" /> Preparando checkout…
                </>
              ) : (
                `Seguir para pagamento · ${formatBRL(paymentCharge)}`
              )}
            </button>
          </div>
        </dialog>
        <dialog
          ref={promoDialogRef}
          id="booking-promo-dialog"
          className="booking-promo-dialog"
          aria-labelledby="booking-promo-title"
          aria-describedby="booking-promo-description"
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            closePromo();
          }}
          onClose={dismissPromo}
          onClick={(event) => {
            if (event.target === event.currentTarget) closePromo();
          }}
        >
          <button
            type="button"
            className="booking-promo-dialog__close"
            aria-label="Fechar promoção"
            onClick={closePromo}
          >
            <X size={19} aria-hidden="true" />
          </button>
          <span className="booking-promo-dialog__stamp" aria-hidden="true">
            {promoAvailable ? `${formatBRL(promoHourlyRateCents)}/h` : "ATÉ R$ 45/H"}
          </span>
          <span className="mono">ARENA LESTE · PROMOÇÃO DE RESERVA</span>
          <h2 id="booking-promo-title">
            {promoAvailable ? "SUA PROMOÇÃO ESTÁ ATIVA" : "COMO APROVEITAR"}
          </h2>
          <p id="booking-promo-description" className="booking-promo-dialog__lead">
            {promoAvailable
              ? `Boa! Sua seleção ativou ${formatBRL(promoHourlyRateCents)} por hora no ${paymentMethod === "pix" ? "Pix" : "dinheiro"}.`
              : "Reserve mais de 2 horas e escolha Pix ou dinheiro para pagar menos."}
          </p>
          <section
            className="booking-promo-dialog__offer"
            aria-label="Tarifa promocional por duração"
          >
            <h3>Mais de 2 horas · Pix ou dinheiro</h3>
            <div className="booking-promo-dialog__daily-rates">
              <div>
                <span>Domingo a quarta</span>
                <strong>R$ 40/h</strong>
              </div>
              <div>
                <span>Quinta a sábado</span>
                <strong>R$ 45/h</strong>
                <small>10% abaixo da tarifa normal de R$ 50/h</small>
              </div>
            </div>
            <p className="booking-promo-dialog__two-hour-note">
              Exatamente 2h: quinta a sábado, 19h–21h ou 21h–23h por R$ 90 no Pix ou dinheiro.
            </p>
          </section>
          <section
            className="booking-promo-dialog__windows"
            aria-label="Valores por faixa de horário"
          >
            <h3>Valores por faixa de horário</h3>
            <div className="booking-promo-dialog__day">
              <h4>Domingo a quarta</h4>
              <div className="booking-promo-dialog__chips">
                <span>
                  <small>18h–19h</small>
                  <b>R$ 40</b>
                </span>
                <span>
                  <small>19h–21h</small>
                  <b>R$ 80</b>
                </span>
                <span>
                  <small>21h–23h</small>
                  <b>R$ 80</b>
                </span>
                <span>
                  <small>23h–0h</small>
                  <b>R$ 40</b>
                </span>
              </div>
            </div>
            <div className="booking-promo-dialog__day">
              <h4>Quinta a sábado</h4>
              <div className="booking-promo-dialog__chips">
                <span>
                  <small>18h–19h</small>
                  <b>R$ 50</b>
                </span>
                <span>
                  <small>19h–21h</small>
                  <b>R$ 90</b>
                </span>
                <span>
                  <small>21h–23h</small>
                  <b>R$ 90</b>
                </span>
                <span>
                  <small>23h–0h</small>
                  <b>R$ 50</b>
                </span>
              </div>
            </div>
          </section>
          <button
            type="button"
            className="btn pri lg booking-promo-dialog__ok"
            autoFocus
            onClick={closePromo}
          >
            OK
          </button>
        </dialog>
      </main>
    </div>
  );
}

function BookingConfirmation({
  booking,
  onNewBooking,
  helpMessage,
}: {
  booking: BookingResult;
  onNewBooking: () => void;
  helpMessage: string;
}) {
  const [copied, setCopied] = useState(false);
  const date = dateLabel(booking.date);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(booking.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="okp" role="status">
      <span className="ck" aria-hidden="true">
        <Check size={34} />
      </span>
      <h2>
        Bora pra <b>areia!</b>
      </h2>
      <p>
        <strong>{booking.space}</strong>
        <br />
        {date} · {booking.slots.map(formatSlot).join(", ")}
      </p>
      <p className="hint">
        {booking.checkoutUrl
          ? "Sua reserva está aguardando a confirmação da cobrança pela InfinitePay. Guarde o código; o retorno do checkout será validado pelo servidor."
          : booking.method === "pix" && booking.pixSimulated
            ? "Sua solicitação foi registrada em modo demonstrativo; este código não confirma pagamento."
            : "Sua solicitação foi registrada online. Guarde o código e aguarde a confirmação da equipe."}
      </p>
      <div className="booking-confirm-meta">
        <div>
          <span className="mono">Código da reserva</span>
          <b>{booking.code}</b>
          <button
            className="ic"
            type="button"
            onClick={copyCode}
            aria-label="Copiar código da reserva"
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
        </div>
        <div>
          <span className="mono">Total da reserva</span>
          <b>{formatBRL(booking.amount)}</b>
        </div>
      </div>
      {booking.method === "pix" && booking.paymentPlan === "deposit_30" && (
        <div className="booking-confirm-meta">
          <div>
            <span className="mono">Cobrança inicial · 30%</span>
            <b>{formatBRL(booking.chargeAmount)}</b>
          </div>
          <div>
            <span className="mono">Saldo restante</span>
            <b>{formatBRL(booking.balanceDue)}</b>
          </div>
        </div>
      )}
      {booking.promoApplied && (
        <p className="booking-promo-applied">
          Promoção aplicada: tarifa especial conforme o dia e a forma de pagamento.
        </p>
      )}
      {booking.method === "pix" && booking.pixSimulated && booking.pixPayload && (
        <div className="pix-note">
          <strong>Pix demonstrativo — sem cobrança real</strong>
          <p>
            Este site não conecta a banco ou processador. Confirme o pagamento diretamente com a
            Arena.
          </p>
          <code>{booking.pixPayload}</code>
        </div>
      )}
      {booking.checkoutUrl && (
        <a className="btn pri lg mt-4" href={booking.checkoutUrl} rel="noopener noreferrer">
          Continuar para Pix ou cartão na InfinitePay
        </a>
      )}
      <div className="bt">
        <a
          className="btn pri lg"
          href={waLink(helpMessage)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={17} /> Avisar a equipe pelo WhatsApp
        </a>
        <button className="btn lg" type="button" onClick={onNewBooking}>
          <Ticket size={17} /> Nova reserva
        </button>
      </div>
    </section>
  );
}
