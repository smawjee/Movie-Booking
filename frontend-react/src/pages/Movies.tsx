import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { api, money, poster } from "../lib/api";
import { experiences } from "../lib/experiences";
import { useTrailers } from "../lib/hooks";
import { TrailerModal } from "../components/TrailerModal";
import { moviesRoute } from "../routes";
import type { Trailer } from "../types";

export function Movies() {
  const search = moviesRoute.useSearch();
  const films = useQuery({ queryKey: ["movies"], queryFn: api.movies });
  const trailers = useTrailers();
  const [playing, setPlaying] = useState<Trailer | null>(null);
  const trailerById = new Map(
    (trailers.data || []).map((t) => [t.id, t] as const),
  );
  const [cinema, setCinema] = useState("edinburgh"),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [format, setFormat] = useState(""),
    [title, setTitle] = useState(search.movie || ""),
    [rating, setRating] = useState(""),
    [genre, setGenre] = useState("");
  const screens = useQuery({
    queryKey: ["screenings", cinema, date, format],
    queryFn: () =>
      api.screenings(
        new URLSearchParams({ cinema, date, ...(format && { format }) }),
      ),
  });
  const list =
    films.data?.filter(
      (m) =>
        (!title || m.title.toLowerCase().includes(title.toLowerCase())) &&
        (!rating || m.rating === rating) &&
        (!genre || m.genre_ids.includes(Number(genre))),
    ) || [];
  return (
    <section className="section">
      <span className="eyebrow">Now showing</span>
      <h1 className="page-title">Choose your experience.</h1>
      <div className="filters card">
        <div className="filter-heading">
          <span className="eyebrow">Find your film</span>
          <strong>{list.length} results</strong>
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
          <select value={cinema} onChange={(e) => setCinema(e.target.value)}>
            <option value="edinburgh">Edinburgh</option>
            <option value="glasgow">Glasgow</option>
            <option value="london">London West End</option>
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
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
          rating && `Rated ${rating}`,
        ]
          .filter(Boolean)
          .map((value) => (
            <span key={String(value)}>{value}</span>
          ))}
      </div>
      {films.isLoading || screens.isLoading ? (
        <div className="empty">Loading showtimes…</div>
      ) : (
        <div className="screening-list">
          {list.map((movie) => (
            <article className="screening card" key={movie.id}>
              <img src={poster(movie.poster_path)} alt="" />
              <div>
                <span className="badge">{movie.rating}</span>
                <h2>{movie.title}</h2>
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
