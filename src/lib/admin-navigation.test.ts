import { describe, expect, it } from "vitest";
import { ADMIN_MODULES, moduleCapabilitiesForRole, modulesForRole } from "./admin-navigation";

describe("navegação orientada do Admin", () => {
  it("oferece propósito, ações e primeiro passo para cada módulo sem IDs repetidos", () => {
    const ids = ADMIN_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ADMIN_MODULES.length).toBeGreaterThan(0);

    for (const module of ADMIN_MODULES) {
      expect(module.label.trim()).not.toBe("");
      expect(module.group.trim()).not.toBe("");
      expect(module.description.trim()).not.toBe("");
      expect(module.firstStep.trim()).not.toBe("");
      expect(module.capabilities.length).toBeGreaterThan(0);
      expect(module.capabilities.every((action) => action.trim().length > 0)).toBe(true);
    }
  });

  it("mantém as áreas filtradas pelos mesmos papéis já definidos", () => {
    expect(modulesForRole("master").map(({ id }) => id)).toEqual(ADMIN_MODULES.map(({ id }) => id));
    expect(modulesForRole("caixa").map(({ id }) => id)).toEqual([
      "overview",
      "reservations",
      "hours",
    ]);
    expect(modulesForRole("midia").map(({ id }) => id)).toEqual([
      "agenda",
      "gallery",
      "tournament",
    ]);
  });

  it("explica o bloqueio manual de reservas somente no perfil Admin Master", () => {
    const reservations = ADMIN_MODULES.find((module) => module.id === "reservations");
    expect(reservations).toBeDefined();
    expect(moduleCapabilitiesForRole(reservations!, "master")).toContain(
      "Criar bloqueio manual imediato, sem pagamento",
    );
    expect(moduleCapabilitiesForRole(reservations!, "caixa")).not.toContain(
      "Criar bloqueio manual imediato, sem pagamento",
    );
  });
});
