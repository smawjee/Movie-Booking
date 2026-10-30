import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CinemaSelect } from "./CinemaSelect";
import { api, money, showDate } from "../lib/api";

/** One film's days and times at a chosen cinema, each time linking to seats. */
export function FilmShowtimes({ movieId }: { movieId: number }) {
  const [cinema, setCinema] = useState("edinburgh");
  const [picked, setPicked] = useState("");
  const showing = useQuery({
    queryKey: ["showing", cinema],
    queryFn: () => api.showing(cinema),
    staleTime: 5 * 60 * 1000,
  });
  const dates = showing.data?.find((m) => m.id === movieId)?.dates || [];
  // A day picked at another cinema may not exist here: fall back to the first.
  const date = dates.includes(picked) ? picked : dates[0] || "";
  const screens = useQuery({
    queryKey: ["screenings", cinema, date, ""],
    queryFn: () => api.screenings(new URLSearchParams({ cinema, date })),
    enabled: Boolean(date),
  });
  const times = (screens.data || []).filter((s) => s.movieId === movieId);
  return (
    <section className="film-showtimes card" id="showtimes">
      <div className="film-showtimes-head">
        <h2>Showtimes</h2>
        <label>
          <span className="sr-only">Cinema</span>
          <CinemaSelect
            value={cinema}
            onChange={(slug) => {
              setCinema(slug);
            }}
          />
        </label>
      </div>
      {showing.isLoading ? (
        <p className="loading">Loading showtimes…</p>
      ) : showing.isError ? (
        <p role="alert">
          Couldn’t load showtimes.{" "}
          <button className="text-button" onClick={() => showing.refetch()}>
            Try again
          </button>
        </p>
      ) : !dates.length ? (
        <p className="muted">
          Not showing at this cinema in the next week. Try another cinema, or
          see <Link to="/coming-soon">Coming soon</Link> for advance tickets.
        </p>
      ) : (
        <>
          <div className="date-strip" role="tablist" aria-label="Choose a day">
            {dates.map((d) => {
              const [day, num, month] = showDate(d).replace(",", "").split(" ");
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === date}
                  className={`date-chip${d === date ? " active" : ""}`}
                  onClick={() => setPicked(d)}
                >
                  <small>{day}</small>
                  <strong>{num}</strong>
                  <small>{month}</small>
                </button>
              );
            })}
          </div>
          {screens.isLoading ? (
            <p className="loading">Loading times…</p>
          ) : times.length ? (
            <div className="times" key={`${cinema}-${date}`}>
              {times.map((s) => (
                <Link
                  key={s.id}
                  to="/booking"
                  search={{ screening: s.id }}
                  className={`time format-${s.experience.id}`}
                >
                  <strong>{s.time}</strong>
                  <small>
                    {s.experience.name} · Screen {s.screen}
                  </small>
                  <small>{money(s.pricePence)}</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted">No showtimes left on this day.</p>
          )}
        </>
      )}
    </section>
  );
}
