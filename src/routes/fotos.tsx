import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Expand, Hand, ImageOff, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Grainient from "@/components/Grainient.jsx";
import FlipCard from "@/components/FlipCard.jsx";
import { getPublicGalleryPhotos, type PhotoGalleryPhoto } from "@/lib/gallery.functions";

export const Route = createFileRoute("/fotos")({
  head: () => ({
    meta: [
      { title: "Galeria de fotos do Torneio Novembro Azul — Arena Leste" },
      { name: "description", content: "Encontre e baixe sua foto do Torneio Novembro Azul." },
    ],
  }),
  component: PhotosPage,
});

function PhotosPage() {
  const fetchPhotos = useServerFn(getPublicGalleryPhotos);
  const [photos, setPhotos] = useState<PhotoGalleryPhoto[]>([]);
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("all");
  const [visible, setVisible] = useState(40);
  const [loading, setLoading] = useState(true);
  const [expandedPhoto, setExpandedPhoto] = useState<PhotoGalleryPhoto | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void fetchPhotos().then((result) => {
      if (active) {
        setPhotos(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchPhotos]);
  useEffect(() => {
    if (!expandedPhoto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedPhoto(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedPhoto]);
  const courts = useMemo(
    () => Array.from(new Set(photos.map((photo) => photo.court))).sort(),
    [photos],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return photos.filter((photo) => {
      const matchesCourt = court === "all" || photo.court === court;
      const matchesText =
        !normalized ||
        `${photo.title} ${photo.altText} ${photo.court}`.toLowerCase().includes(normalized);
      return matchesCourt && matchesText;
    });
  }, [court, photos, query]);
  const shown = filtered.slice(0, visible);
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visible >= filtered.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible((value) => Math.min(value + 40, filtered.length));
        }
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visible]);
  return (
    <main className="photos-page" id="conteudo">
      <Grainient
        className="photos-page__grainient"
        colors={["#120f17", "#3b160b", "#df4f07", "#ff9a3d", "#fff0dc"]}
        type="radial"
        speed={0.55}
        flow={0.7}
        grainAmount={0.1}
        interactive
        clickSwirl
      />
      <div className="photos-page__content wrap sec">
        <header className="photo-gallery-heading">
          <div className="photo-gallery-brand">
            <img src="/images/arena-leste-zip-logo.png" alt="Arena Leste" />
            <span className="mono">Memórias da areia</span>
          </div>
          <span className="photo-gallery-kicker">Galeria oficial</span>
          <h1 className="mt-2 font-display text-5xl font-extrabold uppercase sm:text-7xl">
            Encontre sua foto
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Role para baixo para explorar os momentos do Novembro Azul. Achou a sua? Clique na foto
            para virar o cartão e baixar.
          </p>
          <div className="photo-gallery-instruction" role="note">
            <Hand size={22} aria-hidden="true" />
            <span>Clique em cima da foto para ver e baixar</span>
            <span className="photo-gallery-drag-note">Role para baixo para ver mais fotos</span>
          </div>
        </header>
        <div className="photo-tools mt-8" role="search">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={18}
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(40);
              }}
              placeholder="Buscar (ex: quadra 2)"
              aria-label="Buscar"
              className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar quadra</span>
            <select
              value={court}
              onChange={(event) => {
                setCourt(event.target.value);
                setVisible(40);
              }}
              aria-label="Filtrar quadra"
              className="h-12 min-w-44 rounded-xl border border-border bg-card px-3"
            >
              <option value="all">Todas as quadras</option>
              {courts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p className="mt-12 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} /> Carregando fotos…
          </p>
        ) : shown.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <ImageOff className="mx-auto mb-3" /> Nenhuma foto encontrada com esse filtro.
          </div>
        ) : (
          <>
            <div
              className="photo-grid mt-8"
              aria-label="Galeria de fotos. Role verticalmente para ver mais."
              aria-live="polite"
            >
              {shown.map((photo) => (
                <div className="photo-flip-wrap" key={photo.id}>
                  <FlipCard
                    className="photo-flip-card"
                    width={320}
                    height={400}
                    radius={22}
                    background="#17100c"
                    color="#fff8f1"
                    ariaLabel={`${photo.title}. Clique para ver as opções de download.`}
                    front={
                      <div className="photo-flip-face photo-flip-face--front">
                        <small>{photo.court}</small>
                        <img
                          src={photo.imageUrl}
                          loading="lazy"
                          decoding="async"
                          alt={photo.altText || `Foto do jogo, ${photo.court}`}
                        />
                        <strong>{photo.title}</strong>
                        <span className="photo-flip-hint">Clique para ver opções</span>
                      </div>
                    }
                    back={
                      <div className="photo-flip-face photo-flip-face--back">
                        <span className="mono">FOTO SELECIONADA</span>
                        <h2>{photo.title}</h2>
                        <p>Baixe sua foto e poste seu momento nas redes sociais.</p>
                        <a
                          className="photo-download photo-download--large"
                          href={photo.imageUrl}
                          download
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const link = event.currentTarget;
                            const downloadLink = document.createElement("a");
                            downloadLink.href = link.href;
                            downloadLink.download = "arena-leste-foto.webp";
                            document.body.appendChild(downloadLink);
                            downloadLink.click();
                            downloadLink.remove();
                          }}
                          aria-label={`Baixar ${photo.title}`}
                        >
                          <Download size={22} /> Baixar foto
                        </a>
                        <button
                          className="photo-expand-button"
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedPhoto(photo);
                          }}
                          aria-label={`Expandir ${photo.title}`}
                        >
                          <Expand size={18} /> Expandir foto
                        </button>
                      </div>
                    }
                  />
                </div>
              ))}
            </div>
            <div ref={loadMoreRef} className="photo-gallery-load-sentinel" aria-hidden="true">
              {visible < filtered.length
                ? "Carregando mais fotos…"
                : "Você chegou ao fim da galeria."}
            </div>
          </>
        )}
      </div>
      {expandedPhoto && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada: ${expandedPhoto.title}`}
          onClick={() => setExpandedPhoto(null)}
        >
          <div className="photo-lightbox__panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="photo-lightbox__close"
              type="button"
              onClick={() => setExpandedPhoto(null)}
              aria-label="Fechar foto ampliada"
            >
              <X size={24} />
            </button>
            <img src={expandedPhoto.imageUrl} alt={expandedPhoto.altText || expandedPhoto.title} />
            <div className="photo-lightbox__caption">
              <strong>{expandedPhoto.title}</strong>
              <span>{expandedPhoto.court}</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
