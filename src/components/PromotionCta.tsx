import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PromotionCta() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        className="landing-promo-cta"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="landing-promo-cta__beam" aria-hidden="true" />
        <span className="mono">OFERTA DA AREIA</span>
        <strong>Alugue mais. Pague menos.</strong>
        <b>Confira a promoção</b>
      </button>
      <dialog
        ref={dialogRef}
        className="booking-promo-dialog landing-promo-dialog"
        aria-labelledby="landing-promo-title"
        aria-describedby="landing-promo-description"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <button
          type="button"
          className="booking-promo-dialog__close"
          aria-label="Fechar promoção"
          onClick={() => setOpen(false)}
        >
          <X size={19} aria-hidden="true" />
        </button>
        <span className="booking-promo-dialog__stamp">ATÉ R$ 40 / HORA</span>
        <span className="mono">ARENA LESTE · PROMOÇÃO ESPECIAL</span>
        <h2 id="landing-promo-title">Mais tempo na areia</h2>
        <p id="landing-promo-description">
          Alugue acima de 2 horas pagando no Pix ou dinheiro e ative a tarifa especial.
        </p>
        <ul className="booking-promo-dialog__rules">
          <li>
            <b>Domingo a quarta:</b> 18–19 R$40 · 19–21 R$80 · 21–23 R$80 · 23–00 R$40
          </li>
          <li>
            <b>Quinta a sábado:</b> 18–19 R$50 · 19–21 R$100 · 21–23 R$100 · 23–00 R$50
          </li>
          <li>
            <b>Acima de 2 horas:</b> R$40/h de domingo a quarta ou R$45/h de quinta a sábado.
          </li>
          <li>
            O desconto de 10% corresponde à tarifa de R$45/h de quinta a sábado no Pix ou dinheiro.
          </li>
        </ul>
        <Link
          className="btn pri lg booking-promo-dialog__ok"
          to="/reservar"
          search={{ unit: "unidade-1" }}
        >
          Quero reservar
        </Link>
      </dialog>
    </>
  );
}
