import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Info, Play, Ticket } from "lucide-react";
import { languageLabel } from "../lib/language";
import type { Movie, Trailer } from "../types";

const ROTATE_MS = 7000;

/** Home spotlight: the top films with backdrops, cross-fading on a timer.
 *  Pauses while hovered or focused, and stays put with reduced motion. */
export function FeaturedHero({
  films,
  trailers,
  onPlayTrailer,
}: {
  films: Movie[];
  trailers: Map<number, Trailer>;
  onPlayTrailer: (trailer: Trailer) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || films.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % films.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused, films.length]);
  const film = films[index];
  const trailer = trailers.get(film.id);
  return (
    <section
      className="featured-hero"
      aria-roledescription="carousel"
      aria-label="Featured films"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {films.map((f, i) => (
        <img
          key={f.id}
          className={`featured-backdrop${i === index ? " active" : ""}`}
          src={`https://image.tmdb.org/t/p/w1280${f.backdrop_path}`}
          alt=""
          aria-hidden="true"
          loading={i === 0 ? "eager" : "lazy"}
        />
      ))}
      <div className="featured-copy" key={film.id}>
        <span className="eyebrow">Now showing · Popular this week</span>
        <h1>{film.title}</h1>
        <div className="featured-meta">
          <span className="badge">{film.rating || "NR"}</span>
          {film.runtime > 0 && (
            <span>
              {Math.floor(film.runtime / 60)}h{" "}
              {String(film.runtime % 60).padStart(2, "0")}m
            </span>
          )}
          {film.release_date && <span>{film.release_date.slice(0, 4)}</span>}
          {languageLabel(film.language) && (
            <span>{languageLabel(film.language)}</span>
          )}
        </div>
        {film.overview && <p>{film.overview}</p>}
        <div className="featured-actions">
          <Link className="button" to="/movies" search={{ movie: film.title }}>
            <Ticket size={16} aria-hidden="true" /> Get tickets
          </Link>
          {trailer && (
            <button
              type="button"
              className="button secondary"
              onClick={() => onPlayTrailer(trailer)}
            >
              <Play size={16} aria-hidden="true" /> Trailer
            </button>
          )}
          <Link
            className="button secondary"
            to="/film/$id"
            params={{ id: String(film.id) }}
          >
            <Info size={16} aria-hidden="true" /> Details
          </Link>
        </div>
      </div>
      {films.length > 1 && (
        <div className="featured-dots">
          {films.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-label={`Show ${f.title}`}
              aria-current={i === index}
              className={i === index ? "active" : undefined}
              onClick={() => setIndex(i)}
            >
              {i === index && !paused && (
                <span style={{ animationDuration: `${ROTATE_MS}ms` }} />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
