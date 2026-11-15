import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, ImageOff, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Grainient from "@/components/Grainient.jsx";
import { getPublicGalleryPhotos, type PhotoGalleryPhoto } from "@/lib/gallery.functions";

export const Route = createFileRoute("/fotos")({
  head: () => ({
    meta: [
      { title: "Fotos do evento — Arena Leste" },
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
        <span className="mono">Galeria</span>
        <h1 className="mt-2 font-display text-5xl font-extrabold uppercase sm:text-7xl">
          Fotos do evento
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Encontre sua foto do Novembro Azul, filtre pela quadra e baixe a imagem para postar nas
          redes.
        </p>
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
            <div className="photo-grid mt-8" aria-live="polite">
              {shown.map((photo) => (
                <figure className="photo-tile" key={photo.id}>
                  <small>{photo.court}</small>
                  <img
                    src={photo.imageUrl}
                    loading="lazy"
                    decoding="async"
                    alt={photo.altText || `Foto do jogo, ${photo.court}`}
                  />
                  <figcaption>
                    <span>{photo.title}</span>
                    <a
                      className="photo-download"
                      href={photo.imageUrl}
                      download
                      aria-label={`Baixar ${photo.title}`}
                    >
                      <Download size={18} />
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
            {visible < filtered.length && (
              <button
                className="btn pri mx-auto mt-8 flex"
                type="button"
                onClick={() => setVisible((value) => value + 40)}
              >
                Carregar mais fotos
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
