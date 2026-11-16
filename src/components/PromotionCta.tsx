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
          Alugando acima de 2 horas, no Pix ou no dinheiro, você paga{" "}
          <strong>R$ 40/h de domingo a quarta</strong> e <strong>R$ 45/h de quinta a sábado</strong>
          .
        </p>
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
