import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Star } from "lucide-react";
import { api } from "../lib/api";
import type { Movie } from "../types";

const hoursAndMinutes = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;

/** Synopsis and leads on a showtimes card; "More info" opens cast and crew
 *  in place, loading the full details only when first opened. */
export function FilmSummary({ movie }: { movie: Movie }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const details = useQuery({
    queryKey: ["film", String(movie.id)],
    queryFn: () => api.movie(String(movie.id)),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const d = details.data;
  const leads = movie.cast?.slice(0, 3) || [];
  return (
    <div className={`film-summary${open ? " open" : ""}`}>
      {movie.overview && <p className="film-summary-text">{movie.overview}</p>}
      {leads.length > 0 && (
        <p className="film-summary-leads">
          <span>Starring</span> {leads.join(", ")}
        </p>
      )}
      <button
        type="button"
        className="text-button more-info"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Less info" : "More info"}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div className="film-summary-panel" id={panelId}>
        <div>
          {details.isLoading ? (
            <p className="loading">Loading cast and crew…</p>
          ) : details.isError ? (
            <p>Couldn’t load more details right now.</p>
          ) : d ? (
            <>
              <ul className="film-summary-facts">
                {d.runtime > 0 && <li>{hoursAndMinutes(d.runtime)}</li>}
                {d.genres.length > 0 && <li>{d.genres.join(" · ")}</li>}
                {d.release_date && <li>{d.release_date.slice(0, 4)}</li>}
                {d.score !== null && (
                  <li className="film-score">
                    <Star size={13} aria-hidden="true" /> {d.score.toFixed(1)}
                  </li>
                )}
              </ul>
              {d.directors.length > 0 && (
                <p className="film-summary-crew">
                  <span>Director</span> {d.directors.join(", ")}
                </p>
              )}
              {d.writers.length > 0 && (
                <p className="film-summary-crew">
                  <span>Writers</span> {d.writers.join(", ")}
                </p>
              )}
              {d.cast.length > 0 && (
                <ul className="mini-cast">
                  {d.cast.slice(0, 8).map((c) => (
                    <li key={`${c.name}-${c.character}`}>
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
                      <strong>{c.name}</strong>
                      {c.character && <small>{c.character}</small>}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/film/$id"
                params={{ id: String(movie.id) }}
                className="text-button details-link"
              >
                Full film page →
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
