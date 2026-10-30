import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Star, Ticket } from "lucide-react";
import { api, poster, showDate } from "../lib/api";
import { languageLabel, languageName } from "../lib/language";
import { TrailerModal } from "../components/TrailerModal";
import { filmRoute } from "../routes";

const hoursAndMinutes = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;

/** Film page: synopsis, cast and crew, facts and a way to book. */
export function Film() {
  const { id } = filmRoute.useParams();
  const film = useQuery({
    queryKey: ["film", id],
    queryFn: () => api.movie(id),
    staleTime: 30 * 60 * 1000,
  });
  const [trailer, setTrailer] = useState(false);
  if (film.isLoading)
    return <section className="section empty loading">Loading film…</section>;
  if (!film.data)
    return (
      <section className="section empty" role="alert">
        We couldn’t load this film.{" "}
        <Link to="/movies" search={{}}>
          Browse what’s on
        </Link>
      </section>
    );
  const m = film.data;
  const year = m.release_date?.slice(0, 4);
  const facts = [
    ["Director", m.directors.join(", ")],
    ["Writers", m.writers.join(", ")],
    ["Release date", m.release_date && showDate(m.release_date)],
    ["Running time", m.runtime && hoursAndMinutes(m.runtime)],
    ["Original language", m.language && languageName(m.language)],
    ["Country", m.countries.join(", ")],
    ["Studio", m.studios.join(", ")],
  ].filter(([, value]) => value) as [string, string][];
  return (
    <>
      <section
        className="film-hero"
        style={
          m.backdrop_path
            ? {
                backgroundImage: `url(https://image.tmdb.org/t/p/w1280${m.backdrop_path})`,
              }
            : undefined
        }
      >
        <div className="film-hero-inner">
          <img
            className="film-poster"
            src={poster(m.poster_path)}
            alt={`${m.title} poster`}
          />
          <div className="film-headline">
            <Link to="/movies" search={{}} className="text-button film-back">
              <ArrowLeft size={14} aria-hidden="true" /> All films
            </Link>
            <h1>
              {m.title}
              {year && <span className="film-year"> ({year})</span>}
            </h1>
            {m.original_title && m.original_title !== m.title && (
              <span className="original-title" lang={m.language}>
                {m.original_title}
              </span>
            )}
            {m.tagline && <p className="film-tagline">{m.tagline}</p>}
            <div className="film-meta">
              <span className="badge">{m.rating || "NR"}</span>
              {m.runtime > 0 && <span>{hoursAndMinutes(m.runtime)}</span>}
              {m.score !== null && (
                <span className="film-score">
                  <Star size={14} aria-hidden="true" /> {m.score.toFixed(1)}
                  <small> / 10 · {m.votes.toLocaleString("en-GB")} votes</small>
                </span>
              )}
              {languageLabel(m.language) && (
                <span className="badge language-badge">
                  {languageLabel(m.language)}
                </span>
              )}
            </div>
            {m.genres.length > 0 && (
              <ul className="film-genres">
                {m.genres.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
            <div className="film-actions">
              <Link className="button" to="/movies" search={{ movie: m.title }}>
                <Ticket size={16} aria-hidden="true" /> Book tickets
              </Link>
              {m.trailer_key && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setTrailer(true)}
                >
                  <Play size={16} aria-hidden="true" /> Watch trailer
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="section film-body">
        <div>
          <h2>Synopsis</h2>
          <p className="film-overview">
            {m.overview || "No synopsis available yet."}
          </p>
          {m.cast.length > 0 && (
            <>
              <h2>Cast</h2>
              <ul className="cast-grid">
                {m.cast.map((c) => (
                  <li key={`${c.name}-${c.character}`} className="cast-card">
                    {c.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${c.profile_path}`}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className="cast-initials" aria-hidden="true">
                        {c.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                    )}
                    <strong>{c.name}</strong>
                    {c.character && <small>{c.character}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {facts.length > 0 && (
          <aside className="film-facts card">
            <h2>Details</h2>
            <dl>
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </section>
      {trailer && m.trailer_key && (
        <TrailerModal
          trailerUrl={`https://www.youtube.com/embed/${m.trailer_key}`}
          title={m.title}
          onClose={() => setTrailer(false)}
        />
      )}
    </>
  );
}
