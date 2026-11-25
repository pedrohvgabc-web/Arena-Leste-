import { describe, it, expect } from "vitest";
import {
  calculateBookingPrice,
  formatDuration,
  initialPaymentCents,
  paymentProgressPercentages,
  splitAmountCents,
  verifiedPaymentAmountCents,
  validateSlot,
  slotsFor,
  normalizePhone,
  suggestOpeningWindow,
  validateOpeningWindows,
  calendarMonthDays,
  BOOKING_HORIZON_DAYS,
  isWithinBookingHorizon,
  hasFirstAndLastName,
  normalizeFullName,
  promotionalHourlyRateCents,
  validateAdminManualRange,
  isValidDateISO,
  type OpeningWindow,
} from "./arena-rules";

// 2026-10-24 é sábado. Agora = sexta-feira, 23/10/2026, 09:00 em Porto Velho.
const NOW = new Date("2026-10-23T13:00:00Z");
const SATURDAY: OpeningWindow[] = [{ start: "17:00", end: "23:00" }];
const TUESDAY: OpeningWindow[] = [
  { start: "08:00", end: "12:00" },
  { start: "14:00", end: "22:00" },
];

describe("nome do responsável pela reserva", () => {
  it("exige pelo menos nome e sobrenome e normaliza espaços extras", () => {
    expect(hasFirstAndLastName("Pedro")).toBe(false);
    expect(hasFirstAndLastName("  Pedro   Henrique  ")).toBe(true);
    expect(hasFirstAndLastName("Ana Maria da Silva")).toBe(true);
    expect(normalizeFullName("  Ana   Maria da Silva  ")).toBe("Ana Maria da Silva");
  });
});

describe("regras de funcionamento configuráveis", () => {
  it("fornece calendário mensal alinhado ao domingo e janela de agenda de seis meses", () => {
    expect(BOOKING_HORIZON_DAYS).toBe(180);
    expect(calendarMonthDays("2026-04").slice(0, 5)).toEqual([
      null,
      null,
      null,
      "2026-04-01",
      "2026-04-02",
    ]);
    expect(calendarMonthDays("2026-04")).toHaveLength(33);
    expect(calendarMonthDays("2026-13")).toEqual([]);
  });

  it("valida no servidor o limite superior de 180 dias para reservas", () => {
    const latest = new Date("2026-10-23T12:00:00Z");
    latest.setUTCDate(latest.getUTCDate() + BOOKING_HORIZON_DAYS);
    const latestISO = latest.toISOString().slice(0, 10);
    const afterLatest = new Date(latest);
    afterLatest.setUTCDate(afterLatest.getUTCDate() + 1);
    expect(isWithinBookingHorizon("2026-10-23", "2026-10-23")).toBe(true);
    expect(isWithinBookingHorizon(latestISO, "2026-10-23")).toBe(true);
    expect(isWithinBookingHorizon(afterLatest.toISOString().slice(0, 10), "2026-10-23")).toBe(
      false,
    );
    expect(
      validateSlot(
        afterLatest.toISOString().slice(0, 10),
        "08:00",
        [{ start: "08:00", end: "09:00" }],
        60,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "A agenda aceita reservas até 180 dias à frente." });
    expect(isWithinBookingHorizon("2026-10-22", "2026-10-23")).toBe(false);
  });

  it("sugere um segundo intervalo válido, sem sobrepor o padrão 17h–23h", () => {
    const suggestion = suggestOpeningWindow([{ start: "17:00", end: "23:00" }]);
    expect(suggestion).toEqual({ start: "08:00", end: "12:00" });
    expect(validateOpeningWindows([{ start: "17:00", end: "23:00" }, suggestion!])).toBeNull();
  });
  it("mantém a seleção pública entre 19h–23h em dias úteis e 15h–23h no fim de semana", () => {
    const weekday = [{ start: "19:00", end: "23:00" }];
    const weekend = [{ start: "15:00", end: "23:00" }];
    expect(validateSlot("2026-10-27", "18:00", weekday, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-27", "19:00", weekday, 60, NOW).ok).toBe(true);
    expect(validateSlot("2026-10-27", "22:00", weekday, 60, NOW).ok).toBe(true);
    expect(validateSlot("2026-10-27", "23:00", weekday, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-24", "14:00", weekend, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-24", "15:00", weekend, 60, NOW).ok).toBe(true);
    expect(validateSlot("2026-10-24", "22:00", weekend, 60, NOW).ok).toBe(true);
  });
  it("sugere intervalos semanais somente dentro da janela comercial daquele dia", () => {
    expect(
      suggestOpeningWindow([{ start: "19:00", end: "21:00" }], { start: "19:00", end: "23:00" }),
    ).toEqual({
      start: "21:00",
      end: "23:00",
    });
    expect(
      suggestOpeningWindow([{ start: "19:00", end: "23:00" }], { start: "19:00", end: "23:00" }),
    ).toBeNull();
    expect(
      suggestOpeningWindow([{ start: "15:00", end: "23:00" }], { start: "15:00", end: "23:00" }),
    ).toBeNull();
  });
  it("rejeita intervalos sobrepostos antes de salvar", () => {
    expect(
      validateOpeningWindows([
        { start: "14:00", end: "23:00" },
        { start: "17:00", end: "23:00" },
      ]),
    ).toBe("Os intervalos não podem se sobrepor.");
  });
  it("aceita 24:00 apenas como fechamento e inclui o último slot até meia-noite", () => {
    const overnight: OpeningWindow[] = [{ start: "19:00", end: "24:00" }];
    expect(validateOpeningWindows(overnight)).toBeNull();
    expect(slotsFor("2026-10-23", overnight).at(-1)).toEqual({ start: "23:00", end: "24:00" });
    expect(validateSlot("2026-10-23", "23:00", overnight, 60, NOW)).toEqual({
      ok: true,
      end: "24:00",
    });
    expect(validateOpeningWindows([{ start: "19:00", end: "24:15" }])).toBe(
      "Informe horários de abertura e fechamento válidos.",
    );
  });
  it("aceita a grade comercial de quatro blocos e preserva os blocos de duas horas", () => {
    const commercial: OpeningWindow[] = [
      { start: "18:00", end: "19:00", slotMinutes: 60 },
      { start: "19:00", end: "21:00", slotMinutes: 120 },
      { start: "21:00", end: "23:00", slotMinutes: 120 },
      { start: "23:00", end: "24:00", slotMinutes: 60 },
    ];
    expect(validateOpeningWindows(commercial)).toBeNull();
    expect(slotsFor("2026-10-25", commercial)).toEqual([
      { start: "18:00", end: "19:00" },
      { start: "19:00", end: "21:00" },
      { start: "21:00", end: "23:00" },
      { start: "23:00", end: "24:00" },
    ]);
  });
  it("não sugere uma segunda janela se não houver um espaço de uma hora", () => {
    expect(suggestOpeningWindow([{ start: "08:00", end: "23:00" }])).toBeNull();
  });
  it("não gera slots para uma unidade fechada", () =>
    expect(slotsFor("2026-10-25", []).length).toBe(0));
  it("bloqueia data passada", () =>
    expect(validateSlot("2026-10-20", "10:00", TUESDAY, 60, NOW).ok).toBe(false));
  it("gera slots completos dentro da grade semanal", () => {
    const slots = slotsFor("2026-10-24", SATURDAY);
    expect(slots[0]).toEqual({ start: "17:00", end: "18:00" });
    expect(slots.at(-1)).toEqual({ start: "22:00", end: "23:00" });
  });
  it("mantém os dois blocos de duas horas unidos", () => {
    expect(
      slotsFor("2026-10-23", [
        { start: "19:00", end: "21:00", slotMinutes: 120 },
        { start: "22:00", end: "24:00", slotMinutes: 120 },
      ]),
    ).toEqual([
      { start: "19:00", end: "21:00" },
      { start: "22:00", end: "24:00" },
    ]);
  });
  it("não inclui horário fora da grade configurada", () => {
    expect(validateSlot("2026-10-24", "16:00", SATURDAY, 60, NOW).ok).toBe(false);
  });
  it("respeita intervalo entre janelas de abertura", () => {
    expect(validateSlot("2026-10-27", "12:00", TUESDAY, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-27", "13:00", TUESDAY, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-27", "14:00", TUESDAY, 60, NOW).ok).toBe(true);
  });
  it("impede início de slot que ultrapassa o fechamento", () => {
    expect(validateSlot("2026-10-24", "22:30", SATURDAY, 60, NOW).ok).toBe(false);
  });
  it("bloqueia horário de hoje que já passou", () => {
    expect(
      validateSlot("2026-10-23", "08:00", [{ start: "07:00", end: "12:00" }], 60, NOW).ok,
    ).toBe(false);
  });
  it("rejeita data inexistente e horário inválido", () => {
    expect(validateSlot("2026-02-30", "14:00", TUESDAY, 60, NOW).ok).toBe(false);
    expect(validateSlot("2026-10-27", "24:00", TUESDAY, 60, NOW).ok).toBe(false);
  });
  it("valida reservas manuais entre 00:00 e 24:00 em incrementos de 15 minutos", () => {
    expect(isValidDateISO("2026-02-28")).toBe(true);
    expect(isValidDateISO("2026-02-30")).toBe(false);
    expect(validateAdminManualRange("13:00", "24:00")).toEqual({
      ok: true,
      durationMinutes: 660,
    });
    expect(validateAdminManualRange("13:15", "14:45")).toEqual({
      ok: true,
      durationMinutes: 90,
    });
    expect(validateAdminManualRange("00:00", "01:00")).toEqual({
      ok: true,
      durationMinutes: 60,
    });
    expect(validateAdminManualRange("23:45", "24:00")).toEqual({
      ok: true,
      durationMinutes: 15,
    });
    expect(validateAdminManualRange("24:00", "24:15").ok).toBe(false);
    expect(validateAdminManualRange("23:45", "24:15").ok).toBe(false);
    expect(validateAdminManualRange("00:00", "00:00").ok).toBe(false);
    expect(validateAdminManualRange("14:00", "14:00").ok).toBe(false);
    expect(validateAdminManualRange("13:01", "14:00").ok).toBe(false);
  });
});

describe("preço normal e promoção de reservas", () => {
  it("mantém a tarifa normal configurada sem data e método promocional", () => {
    expect(calculateBookingPrice(6_000, 60, 1)).toEqual({
      perSlotCents: 6_000,
      totalCents: 6_000,
      promoApplied: false,
    });
    expect(calculateBookingPrice(6_000, 60, 2)).toEqual({
      perSlotCents: 6_000,
      totalCents: 12_000,
      promoApplied: false,
    });
  });
  it("cobra R$60 na primeira hora e R$40 por hora adicional de domingo a quarta", () => {
    expect(promotionalHourlyRateCents("2026-11-15", "pix", 120)).toBe(4_000);
    expect(calculateBookingPrice(5_000, 60, 1, "2026-11-17", "pix")).toEqual({
      perSlotCents: 6_000,
      totalCents: 6_000,
      promoApplied: false,
    });
    expect(calculateBookingPrice(6_000, 60, 2, "2026-11-17", "pix")).toEqual({
      perSlotCents: 5_000,
      totalCents: 10_000,
      promoApplied: true,
    });
    expect(calculateBookingPrice(6_000, 60, 3, "2026-11-17", "cash_onsite")).toEqual({
      perSlotCents: 4_667,
      totalCents: 14_000,
      promoApplied: true,
    });
  });
  it("cobra R$60 na primeira hora e R$45/h adicional de quinta a sábado, sem janela especial", () => {
    expect(promotionalHourlyRateCents("2026-11-19", "cash_onsite", 180)).toBe(4_500);
    expect(promotionalHourlyRateCents("2026-11-19", "card_onsite", 180)).toBeNull();
    expect(calculateBookingPrice(6_000, 60, 1, "2026-11-19", "cash_onsite")).toEqual({
      perSlotCents: 6_000,
      totalCents: 6_000,
      promoApplied: false,
    });
    // A antiga exceção de R$90 para 19h–21h agora segue a regra geral: R$60 + R$45.
    expect(
      calculateBookingPrice(6_000, 60, 2, "2026-11-19", "pix", 120, ["19:00", "20:00"]),
    ).toEqual({ perSlotCents: 5_250, totalCents: 10_500, promoApplied: true });
    expect(calculateBookingPrice(6_000, 60, 3, "2026-11-21", "cash_onsite")).toEqual({
      perSlotCents: 5_000,
      totalCents: 15_000,
      promoApplied: true,
    });
    expect(
      calculateBookingPrice(6_000, 60, 2, "2026-11-19", "pix", 120, ["18:00", "19:00"]).totalCents,
    ).toBe(10_500);
  });
  it("preserva métodos não elegíveis e aplica a primeira hora promocional fixa", () => {
    for (const method of ["card_onsite", "admin_manual"] as const) {
      expect(promotionalHourlyRateCents("2026-11-19", method, 180)).toBeNull();
    }
    expect(calculateBookingPrice(5_000, 60, 1, "2026-11-19", "card_onsite")).toEqual({
      perSlotCents: 5_000,
      totalCents: 5_000,
      promoApplied: false,
    });
    expect(calculateBookingPrice(6_000, 60, 2, "2026-11-19", "card_onsite")).toEqual({
      perSlotCents: 6_000,
      totalCents: 12_000,
      promoApplied: false,
    });
  });
  it("arredonda adicional em centavos de forma determinística para slots fracionários", () => {
    expect(
      calculateBookingPrice(6_000, 30, 3, "2026-11-17", "pix", 90, ["19:00", "19:30", "20:00"]),
    ).toEqual({
      perSlotCents: 2_667,
      totalCents: 8_000,
      promoApplied: true,
    });
    expect(
      calculateBookingPrice(6_000, 30, 4, "2026-11-19", "pix", 120, [
        "18:00",
        "18:30",
        "19:00",
        "19:30",
      ]).totalCents,
    ).toBe(10_500);
  });

  it("não dá desconto a dois slots de 30 min que somam exatamente uma hora", () => {
    expect(calculateBookingPrice(3_000, 30, 2)).toEqual({
      perSlotCents: 3_000,
      totalCents: 6_000,
      promoApplied: false,
    });
  });

  it("mantém a tarifa normal quando não há promoção elegível", () => {
    expect(calculateBookingPrice(9_000, 90, 1)).toEqual({
      perSlotCents: 9_000,
      totalCents: 9_000,
      promoApplied: false,
    });
    expect(calculateBookingPrice(3_000, 30, 3)).toEqual({
      perSlotCents: 3_000,
      totalCents: 9_000,
      promoApplied: false,
    });
  });

  it("mantém uma tarifa configurada abaixo de R$60/h quando não há promoção elegível", () => {
    expect(calculateBookingPrice(4_000, 60, 2)).toEqual({
      perSlotCents: 4_000,
      totalCents: 8_000,
      promoApplied: false,
    });
  });
  it("totaliza a tarifa normal e permite a jornada de 16 horas", () => {
    expect(calculateBookingPrice(6_000, 60, 4)).toEqual({
      perSlotCents: 6_000,
      totalCents: 24_000,
      promoApplied: false,
    });
    expect(calculateBookingPrice(6_000, 60, 16).totalCents).toBe(96_000);
  });
  it("calcula 30% em centavos e distribui o total sem perder centavos", () => {
    expect(initialPaymentCents(20_000, "deposit_30")).toBe(6_000);
    expect(initialPaymentCents(20_001, "deposit_30")).toBe(6_000);
    expect(initialPaymentCents(20_000, "full")).toBe(20_000);
    expect(splitAmountCents(6_001, 4)).toEqual([1_501, 1_500, 1_500, 1_500]);
    expect(splitAmountCents(20_000, 4).reduce((sum, value) => sum + value, 0)).toBe(20_000);
  });

  it("mostra 70% pendente após validar a entrada de 30% e saldo zero no pagamento integral", () => {
    expect(paymentProgressPercentages(20_000, 6_000)).toEqual({
      receivedCents: 6_000,
      remainingCents: 14_000,
      receivedPercentage: 30,
      remainingPercentage: 70,
    });
    expect(paymentProgressPercentages(20_000, 20_000)).toEqual({
      receivedCents: 20_000,
      remainingCents: 0,
      receivedPercentage: 100,
      remainingPercentage: 0,
    });
  });

  it("formata duração real e só soma recebimentos verificados", () => {
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(
      verifiedPaymentAmountCents([
        {
          provider: "infinitepay",
          providerStatus: "paid",
          bookingStatus: "expired",
          amountCents: 6_000,
        },
        {
          provider: "infinitepay",
          providerStatus: "pending",
          bookingStatus: "paid",
          amountCents: 6_000,
        },
        {
          provider: "onsite",
          providerStatus: "pending",
          bookingStatus: "paid",
          amountCents: 2_000,
        },
        {
          provider: "demo",
          providerStatus: "paid",
          bookingStatus: "paid",
          amountCents: 9_000,
        },
      ]),
    ).toBe(8_000);
  });
});

describe("telefone", () => {
  it("aceita celular com DDD", () => expect(normalizePhone("(69) 99999-1234")).toBe("69999991234"));
  it("aceita com +55", () => expect(normalizePhone("+55 69 99999-1234")).toBe("69999991234"));
  it("rejeita curto", () => expect(normalizePhone("1234")).toBeNull());
});
