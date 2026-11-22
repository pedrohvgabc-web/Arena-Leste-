import { beforeEach, describe, expect, it } from "vitest";
import {
  BOOKING_CACHE_MAX_AGE_MS,
  readBookingCache,
  writeBookingCache,
} from "./booking-data-cache";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

describe("cache local dos dados de reserva", () => {
  beforeEach(() => localStorage.clear());

  it("guarda e recupera um snapshot com o instante da última atualização", () => {
    writeBookingCache("dates:unidade-1", ["2026-11-22", "2026-11-23"], 1_000);

    expect(readBookingCache("dates:unidade-1", isStringArray, 2_000)).toEqual({
      data: ["2026-11-22", "2026-11-23"],
      updatedAt: 1_000,
    });
  });

  it("descarta snapshots além da janela de 24 horas", () => {
    writeBookingCache("dates:unidade-1", ["2026-11-22"], 1_000);

    expect(
      readBookingCache("dates:unidade-1", isStringArray, 1_000 + BOOKING_CACHE_MAX_AGE_MS + 1),
    ).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("descarta um snapshot que não corresponde ao tipo esperado", () => {
    writeBookingCache("dates:unidade-1", { not: "a date list" }, 1_000);

    expect(readBookingCache("dates:unidade-1", isStringArray, 2_000)).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("limpa um valor corrompido sem lançar erro", () => {
    localStorage.setItem("arena-leste-booking-cache-v1:dates:unidade-1", "{");

    expect(readBookingCache("dates:unidade-1", isStringArray, 2_000)).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
});
