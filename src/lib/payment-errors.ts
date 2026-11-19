export type PaymentCheckoutContext = "booking" | "wms" | "generic";

export function paymentCheckoutErrorMessage(
  error: unknown,
  context: PaymentCheckoutContext = "generic",
): string {
  const message = error instanceof Error ? error.message : "";
  const contextText =
    context === "booking"
      ? "A reserva foi registrada, mas o link de pagamento não foi criado."
      : context === "wms"
        ? "A venda não foi concluída e o estoque não foi baixado."
        : "O link de pagamento não foi criado.";

  if (message.includes("External checkout is not enabled")) {
    return `${contextText} O Checkout Integrado está desativado na conta InfinitePay. Ative-o nas configurações da conta e tente novamente.`;
  }
  if (message.includes("INFINITEPAY_REQUEST_FAILED:Forbidden")) {
    return `${contextText} A InfinitePay recusou a credencial configurada. Confira se a chave de API pertence à conta correta e tem permissão para criar links.`;
  }
  if (message === "INFINITEPAY_NOT_CONFIGURED") {
    return `${contextText} O checkout online está sem configuração válida. Fale com a Arena para escolher pagamento no local.`;
  }
  if (message === "INFINITEPAY_NETWORK_ERROR") {
    return `${contextText} Não foi possível conectar à InfinitePay agora. Tente novamente em instantes.`;
  }
  if (message === "INFINITEPAY_INVALID_AMOUNT") {
    return "O total precisa ser de pelo menos R$ 1,00 para gerar um link de pagamento.";
  }
  return `${contextText} Tente novamente em instantes ou escolha pagamento no local.`;
}
