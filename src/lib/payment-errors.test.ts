import { describe, expect, it } from "vitest";
import { paymentCheckoutErrorMessage } from "./payment-errors";

describe("paymentCheckoutErrorMessage", () => {
  it("explica quando o Checkout Integrado está desativado no merchant", () => {
    const message = paymentCheckoutErrorMessage(
      new Error("INFINITEPAY_REQUEST_FAILED:External checkout is not enabled for this merchant."),
      "wms",
    );

    expect(message).toContain("A venda não foi concluída e o estoque não foi baixado");
    expect(message).toContain("Checkout Integrado está desativado");
    expect(message).not.toContain("INFINITEPAY_REQUEST_FAILED");
  });

  it("orienta a conferir a chave da API após Forbidden sem exibir detalhes do provedor", () => {
    const message = paymentCheckoutErrorMessage(
      new Error("INFINITEPAY_REQUEST_FAILED:Forbidden"),
      "booking",
    );

    expect(message).toContain("A InfinitePay recusou a credencial configurada");
    expect(message).toContain("chave de API");
    expect(message).not.toContain("Forbidden");
  });

  it("trata falha de rede e valor mínimo sem propagar erro interno", () => {
    expect(paymentCheckoutErrorMessage(new Error("INFINITEPAY_NETWORK_ERROR"))).toContain(
      "Não foi possível conectar à InfinitePay",
    );
    expect(paymentCheckoutErrorMessage(new Error("INFINITEPAY_INVALID_AMOUNT"))).toContain(
      "R$ 1,00",
    );
  });
});
