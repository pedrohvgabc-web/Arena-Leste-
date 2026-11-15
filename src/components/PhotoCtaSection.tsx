import { Link } from "@tanstack/react-router";
import "./PhotoCtaSection.css";

export function PhotoCtaSection() {
  return (
    <section className="photo-landing-cta" aria-labelledby="photo-landing-title">
      <div className="photo-landing-cta__photo" aria-hidden="true" />
      <div className="photo-landing-cta__veil" />
      <div className="photo-landing-cta__content wrap">
        <span className="photo-landing-cta__eyebrow">ARENA LESTE · MEMÓRIAS DA AREIA</span>
        <h2 id="photo-landing-title">Sua jogada. Seu momento.</h2>
        <p>Clique no botão para achar suas fotos e postar nas redes sociais!</p>
        <Link className="btn pri lg photo-landing-cta__button" to="/fotos">
          Ache suas fotos!!!
        </Link>
      </div>
    </section>
  );
}
