import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Clapperboard,
  Clock,
  Globe,
  Languages,
  PenLine,
  Play,
  Star,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { api, poster, showDate } from "../lib/api";
import { languageLabel, languageName } from "../lib/language";
import { TrailerModal } from "../components/TrailerModal";
import { FilmShowtimes } from "../components/FilmShowtimes";
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
  const [story, setStory] = useState(false);
  const programme = useQuery({ queryKey: ["movies"], queryFn: api.movies });
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
    ["Director", m.directors.join(", "), Clapperboard],
    ["Writers", m.writers.join(", "), PenLine],
    ["Release date", m.release_date && showDate(m.release_date), CalendarDays],
    ["Running time", m.runtime && hoursAndMinutes(m.runtime), Clock],
    ["Language", m.language && languageName(m.language), Languages],
    ["Country", m.countries.join(", "), Globe],
    ["Studio", m.studios.join(", "), Building2],
  ].filter(([, value]) => value) as [string, string, LucideIcon][];
  const longStory = (m.overview || "").length > 320;
  // Other films in the programme, those sharing the most genres first.
  const genres = new Set(m.genre_ids);
  const similar = (programme.data || [])
    .filter((f) => f.id !== m.id)
    .map((f) => ({
      f,
      shared: f.genre_ids.filter((g) => genres.has(g)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 10)
    .map(({ f }) => f);
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
              <a
                className="button"
                href="#showtimes"
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById("showtimes")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <Ticket size={16} aria-hidden="true" /> Book tickets
              </a>
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
      <div className="section film-showtimes-wrap">
        <FilmShowtimes movieId={m.id} />
      </div>
      <section className="section film-body">
        <div className="film-main">
          <div className="film-block">
            <span className="eyebrow">The story</span>
            <h2>Synopsis</h2>
            <p
              className={`film-overview${longStory && !story ? " clamped" : ""}`}
            >
              {m.overview || "No synopsis available yet."}
            </p>
            {longStory && (
              <button
                type="button"
                className="text-button read-more"
                aria-expanded={story}
                onClick={() => setStory((v) => !v)}
              >
                {story ? "Show less" : "Read more"}
              </button>
            )}
          </div>
          {m.cast.length > 0 && (
            <div className="film-block">
              <span className="eyebrow">On screen</span>
              <h2>Cast</h2>
              <ul className="cast-row">
                {m.cast.map((c) => (
                  <li key={`${c.name}-${c.character}`} className="cast-card">
                    <span className="cast-photo">
                      {c.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${c.profile_path}`}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span aria-hidden="true">
                          {c.name
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                      )}
                    </span>
                    <strong>{c.name}</strong>
                    {c.character && <small>{c.character}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {facts.length > 0 && (
          <aside className="film-facts card">
            <span className="eyebrow">Behind the film</span>
            <h2>Details</h2>
            <dl>
              {facts.map(([label, value, Icon]) => (
                <div key={label}>
                  <span className="fact-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </section>
      {similar.length > 0 && (
        <section className="section film-similar">
          <span className="eyebrow">Also showing</span>
          <h2>More like this</h2>
          <ul className="similar-row">
            {similar.map((f) => (
              <li key={f.id}>
                <Link to="/film/$id" params={{ id: String(f.id) }}>
                  <span className="similar-poster">
                    <img
                      src={poster(f.poster_path, 342)}
                      alt=""
                      loading="lazy"
                    />
                    <span className="badge movie-rating">
                      {f.rating || "NR"}
                    </span>
                  </span>
                  <strong>{f.title}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
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
