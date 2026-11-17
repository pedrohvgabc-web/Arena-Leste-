import { Apple, Camera, CirclePlay, Download, Play, Share2 } from "lucide-react";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.gravae&hl=en&pli=1";
const APP_STORE_URL = "https://apps.apple.com/br/app/gravae/id6446604410";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Faça sua jogada",
    text: "Nossas câmeras estão sempre prontas para capturar os melhores momentos da sua partida ou treino.",
  },
  {
    number: "02",
    icon: CirclePlay,
    title: "Aperte o botão",
    text: "Para gravar o vídeo, só precisa apertar o botão na sua arena. O vídeo carregará automaticamente no nosso app.",
  },
  {
    number: "03",
    icon: Share2,
    title: "Eternize o momento",
    text: "Faça login no app Grava Aí, é só baixar e compartilhar. Não esqueça de marcar o @gravaai.io.",
  },
];

export function GravaiSection() {
  return (
    <section className="gravai-section" id="gravaai" aria-labelledby="gravaai-title">
      <div className="gravai-glow" aria-hidden="true" />
      <div className="wrap">
        <div className="gravai-header" data-r>
          <div>
            <span className="mono gravai-kicker">Arena Leste · Grava Aí</span>
            <h2 id="gravaai-title">
              Reveja sua jogada.
              <br />
              <b>Compartilhe o momento.</b>
            </h2>
          </div>
          <p>
            Suas melhores jogadas ficam guardadas para você baixar, rever e postar nas redes
            sociais.
          </p>
        </div>

        <div className="gravai-stores" data-r>
          <span className="gravai-stores__label">
            Baixe o Grava Aí e leve seus momentos com você
          </span>
          <div className="gravai-stores__links">
            <a
              className="gravai-store"
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Baixar o Grava Aí na App Store"
            >
              <Apple size={25} aria-hidden="true" />
              <span>
                <small>Disponível na</small>
                <strong>App Store</strong>
              </span>
              <Download size={17} aria-hidden="true" />
            </a>
            <a
              className="gravai-store"
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Baixar o Grava Aí no Google Play"
            >
              <Play size={25} fill="currentColor" aria-hidden="true" />
              <span>
                <small>Disponível no</small>
                <strong>Google Play</strong>
              </span>
              <Download size={17} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="gravai-steps" data-r>
          {steps.map(({ number, icon: Icon, title, text }) => (
            <article className="gravai-step" key={number}>
              <div className="gravai-step__top">
                <span className="gravai-step__number">{number}</span>
                <Icon size={25} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <p className="gravai-handle" data-r>
          <span aria-hidden="true">@</span> gravaai.io · capture. baixe. compartilhe.
        </p>
      </div>
    </section>
  );
}
