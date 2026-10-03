import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { poster } from "../lib/api";
import { useTrailers } from "../lib/hooks";
import { TrailerModal } from "../components/TrailerModal";
import type { Trailer } from "../types";

const tabs = [
  { id: "all", label: "All trailers" },
  { id: "now-showing", label: "Showing now" },
  { id: "coming-soon", label: "Coming soon" },
] as const;

export function Trailers() {
  const trailers = useTrailers();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("all");
  const [playing, setPlaying] = useState<Trailer | null>(null);
  const list = (trailers.data || []).filter(
    (t) => tab === "all" || t.status === tab,
  );
  return (
    <section className="section">
      <span className="eyebrow">Watch first</span>
      <h1 className="page-title">Trailers.</h1>
      <p className="page-intro">
        The latest trailers for films showing now and arriving soon at Cinego.
      </p>
      <div className="segmented" role="tablist" aria-label="Filter trailers">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {trailers.isLoading ? (
        <div className="empty">Loading trailers…</div>
      ) : trailers.isError || !list.length ? (
        <div className="empty" role="status">
          {trailers.isError
            ? "Trailers are temporarily unavailable."
            : "No trailers in this category right now."}
        </div>
      ) : (
        <div className="trailer-grid">
          {list.map((t) => (
            <article className="trailer-card card" key={t.id}>
              <button
                type="button"
                className="trailer-thumb"
                onClick={() => setPlaying(t)}
                aria-label={`Play ${t.title} trailer`}
              >
                <img
                  src={
                    t.backdropPath
                      ? poster(t.backdropPath, 780)
                      : `https://i.ytimg.com/vi/${t.trailerKey}/hqdefault.jpg`
                  }
                  alt=""
                  loading="lazy"
                />
                <span className="trailer-play-icon" aria-hidden="true">
                  <Play size={22} />
                </span>
              </button>
              <div className="trailer-meta">
                <span className="badge">{t.rating || "NR"}</span>
                <h2>{t.title}</h2>
                {t.overview && <p>{t.overview}</p>}
                {t.status === "now-showing" ? (
                  <Link
                    to="/movies"
                    search={{ movie: t.title }}
                    className="button"
                  >
                    Book tickets
                  </Link>
                ) : (
                  <Link to="/coming-soon" className="button secondary">
                    {t.releaseDate ? `Out ${t.releaseDate}` : "Coming soon"} ·
                    Pre-book
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {playing && (
        <TrailerModal
          trailerUrl={playing.trailerUrl}
          title={playing.title}
          onClose={() => setPlaying(null)}
        />
      )}
    </section>
  );
}
