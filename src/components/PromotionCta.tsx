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
        <span className="booking-promo-dialog__stamp">
          BASE R$ 60/H · PROMO A PARTIR DE R$ 40/H
        </span>
        <span className="mono">ARENA LESTE · PROMOÇÃO ESPECIAL</span>
        <h2 id="landing-promo-title">Mais tempo na areia</h2>
        <p id="landing-promo-description">
          Na tarifa promocional, pague menos por hora no Pix ou dinheiro. Veja as regras sem letras
          miúdas:
        </p>
        <ul className="booking-promo-dialog__rules">
          <li>
            <b>Acima de 2 horas:</b> domingo a quarta, R$40/h; quinta a sábado, R$45/h.
          </li>
          <li>
            <b>Exatamente 2 horas:</b> quinta a sábado, 19h–21h ou 21h–23h por R$90 no total.
          </li>
          <li>
            A tarifa promocional vale para Pix ou dinheiro; outras formas seguem o preço normal.
          </li>
          <li>
            Horários públicos: segunda a sexta, 19h–23h; sábado e domingo, 15h–23h. Tarifa base:
            R$60/h.
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
