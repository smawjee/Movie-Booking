import { useEffect, useMemo, useRef, useState } from "react";
import { MovieTrie } from "../lib/movieTrie";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, SlidersHorizontal } from "lucide-react";
import { CinemaSelect } from "../components/CinemaSelect";
import { api, money, poster, showDate } from "../lib/api";
import { experiences } from "../lib/experiences";
import { languageLabel, languageName } from "../lib/language";
import { useTrailers } from "../lib/hooks";
import { TrailerModal } from "../components/TrailerModal";
import { moviesRoute } from "../routes";
import type { Trailer } from "../types";

const todayIso = () => new Date().toLocaleDateString("en-CA");

export function Movies() {
  const search = moviesRoute.useSearch();
  const navigate = moviesRoute.useNavigate();
  const title = search.movie || "";
  const setTitle = (movie: string) =>
    navigate({ search: { movie }, replace: true });
  const trailers = useTrailers();
  const [playing, setPlaying] = useState<Trailer | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const trailerById = new Map(
    (trailers.data || []).map((t) => [t.id, t] as const),
  );
  const [cinema, setCinema] = useState("edinburgh"),
    [date, setDate] = useState(todayIso),
    [format, setFormat] = useState(""),
    [rating, setRating] = useState(""),
    [genre, setGenre] = useState(""),
    [language, setLanguage] = useState("");
  const screens = useQuery({
    queryKey: ["screenings", cinema, date, format],
    queryFn: () =>
      api.screenings(
        new URLSearchParams({ cinema, date, ...(format && { format }) }),
      ),
  });
  // The trie only ever holds films this cinema is showing; date and format
  // then narrow to the screenings on offer.
  const showing = useQuery({
    queryKey: ["showing", cinema],
    queryFn: () => api.showing(cinema),
    staleTime: 5 * 60 * 1000,
  });
  const trie = useMemo(() => new MovieTrie(showing.data || []), [showing.data]);
  const matches = trie.search(title);
  const scheduled = new Set(screens.data?.map((s) => s.movieId));
  const titleMatches = (showing.data || []).filter((m) => matches.has(m.id));
  const languages = [
    ...new Set((showing.data || []).map((m) => m.language).filter(Boolean)),
  ].sort((a, b) => languageName(a).localeCompare(languageName(b)));
  // A film picked from the home page or search may not play on the chosen day
  // (a day's programme is fixed once made, and evening showings pass), so
  // jump once to the first day that exact film is on at this cinema.
  const nextDates = [
    ...new Set(titleMatches.flatMap((m) => m.dates || [])),
  ].sort();
  const jumpedFor = useRef("");
  useEffect(() => {
    const key = `${cinema}|${title}`;
    if (!title || !screens.data || !showing.data || jumpedFor.current === key)
      return;
    jumpedFor.current = key;
    const picked = titleMatches.filter(
      (m) => m.title.toLowerCase() === title.trim().toLowerCase(),
    );
    if (!picked.length || picked.some((m) => scheduled.has(m.id))) return;
    const first = picked
      .flatMap((m) => m.dates || [])
      .sort()
      .find((d) => d >= todayIso());
    if (first && first !== date) setDate(first);
  });
  const list = titleMatches.filter(
    (m) =>
      scheduled.has(m.id) &&
      (!language || m.language === language) &&
      (!rating || m.rating === rating) &&
      (!genre || m.genre_ids.includes(Number(genre))),
  );
  return (
    <section className="section">
      <span className="eyebrow">Now showing</span>
      <h1 className="page-title">Choose your experience.</h1>
      <div
        className={`filters card collapsible${filtersOpen ? " expanded" : ""}`}
      >
        <div className="filter-heading">
          <span className="eyebrow">Find your film</span>
          <strong>
            {list.length} {list.length === 1 ? "result" : "results"}
          </strong>
          <button
            type="button"
            className="filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
        </div>
        <label className="filter-search">
          Film title
          <input
            type="search"
            value={title}
            placeholder="Search by title…"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Cinema
          <CinemaSelect value={cinema} onChange={setCinema} />
        </label>
        <label>
          Date
          <input
            type="date"
            min={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">All formats</option>
            {Object.entries(experiences).map(([id, x]) => (
              <option key={id} value={id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">All genres</option>
            <option value="28">Action</option>
            <option value="12">Adventure</option>
            <option value="35">Comedy</option>
            <option value="18">Drama</option>
            <option value="27">Horror</option>
            <option value="10751">Family</option>
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="">All languages</option>
            {languages.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rating
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">All ratings</option>
            {["U", "PG", "12A", "15", "18"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          className="clear-filters"
          onClick={() => {
            setTitle("");
            setFormat("");
            setGenre("");
            setLanguage("");
            setRating("");
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="active-filters">
        {[
          title,
          format && experiences[format as keyof typeof experiences].name,
          genre && "Genre selected",
          language && languageName(language),
          rating && `Rated ${rating}`,
        ]
          .filter(Boolean)
          .map((value) => (
            <span key={String(value)}>{value}</span>
          ))}
      </div>
      {showing.isLoading || screens.isLoading ? (
        <div className="empty loading">Loading showtimes…</div>
      ) : showing.isError || screens.isError ? (
        <div className="empty" role="alert">
          Unable to load showtimes.{" "}
          <button
            onClick={() => {
              void showing.refetch();
              void screens.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="empty" role="status">
          {title && titleMatches.length === 0
            ? `“${title}” isn’t showing at this cinema this week. Try another cinema, or browse Coming soon.`
            : titleMatches.length > 0 && format
              ? "That film isn’t showing in this format. Try “All formats”."
              : titleMatches.length > 0 && nextDates.some((d) => d !== date)
                ? "No showtimes left on this date."
                : "No films have showtimes matching these filters. Try another date or format."}
          {!format && nextDates.some((d) => d !== date) && (
            <div className="next-dates">
              {nextDates
                .filter((d) => d !== date)
                .slice(0, 4)
                .map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="button secondary"
                    onClick={() => setDate(d)}
                  >
                    {showDate(d).replace(/ \d{4}$/, "")}
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="screening-list">
          {list.map((movie) => (
            <article className="screening card" key={movie.id}>
              <img src={poster(movie.poster_path)} alt="" />
              <div>
                <span className="badge">{movie.rating}</span>
                {movie.classic && (
                  <span className="badge classic-badge">
                    Classic
                    {movie.release_date &&
                      ` · ${movie.release_date.slice(0, 4)}`}
                  </span>
                )}
                {languageLabel(movie.language) && (
                  <span className="badge language-badge">
                    {languageLabel(movie.language)}
                  </span>
                )}
                <h2>{movie.title}</h2>
                {movie.original_title &&
                  movie.original_title !== movie.title && (
                    <span className="original-title" lang={movie.language}>
                      {movie.original_title}
                    </span>
                  )}
                {trailerById.has(movie.id) && (
                  <button
                    type="button"
                    className="text-button trailer-link"
                    onClick={() => setPlaying(trailerById.get(movie.id)!)}
                  >
                    <Play size={14} aria-hidden="true" /> Watch trailer
                  </button>
                )}
                <p>{movie.overview}</p>
                <div className="times">
                  {screens.data
                    ?.filter((s) => s.movieId === movie.id)
                    .map((s) => (
                      <Link
                        key={s.id}
                        to="/booking"
                        search={{ screening: s.id }}
                        className={`time format-${s.experience.id}`}
                      >
                        <strong>{s.time}</strong>
                        <small>
                          {s.experience.name} · {money(s.pricePence)}
                        </small>
                      </Link>
                    ))}
                </div>
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
