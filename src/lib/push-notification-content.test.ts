import { describe, expect, it } from "vitest";
import { createReservationPushBody } from "./push-notification-content";

describe("createReservationPushBody", () => {
  it("mostra somente nome, data, unidade e intervalos contíguos", () => {
    expect(
      createReservationPushBody({
        name: "Ana Silva",
        date: "2026-11-21",
        unitId: "unidade-1",
        slots: [
          { start: "19:00", end: "19:30" },
          { start: "19:30", end: "20:00" },
          { start: "21:00", end: "22:00" },
        ],
      }),
    ).toBe("Ana Silva · 21/11/2026 · Unidade Cuniã · 19:00–20:00, 21:00–22:00");
  });

  it("usa o nome público de Pinheiro Machado e mantém o fechamento à meia-noite", () => {
    expect(
      createReservationPushBody({
        name: "Bruno Santos",
        date: "2026-11-22",
        unitId: "unidade-2",
        slots: [{ start: "23:00", end: "24:00" }],
      }),
    ).toBe("Bruno Santos · 22/11/2026 · Unidade Pinheiro Machado · 23:00–24:00");
  });

  it("não monta mensagem para dados incompletos ou horários inválidos", () => {
    expect(
      createReservationPushBody({
        name: "   ",
        date: "2026-11-21",
        unitId: "unidade-1",
        slots: [{ start: "19:00", end: "18:00" }],
      }),
    ).toBeNull();
  });

  it("remove controles e não permite que campos extras alterem a mensagem", () => {
    expect(
      createReservationPushBody({
        name: "Ana\nSilva <script>",
        date: "2026-11-21",
        unitId: "unidade-1",
        slots: [{ start: "19:00", end: "20:00" }],
      }),
    ).toBe("Ana Silva script · 21/11/2026 · Unidade Cuniã · 19:00–20:00");
  });
});
