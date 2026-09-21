import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, money, poster } from "../lib/api";

function advanceDates(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date();
    d.setDate(d.getDate() + index + 7);
    return d.toISOString().slice(0, 10);
  });
}

export function ComingSoon() {
  const dates = advanceDates(14);
  const [cinema, setCinema] = useState("edinburgh"),
    [date, setDate] = useState(dates[0]);
  const movies = useQuery({
    queryKey: ["movies-upcoming"],
    queryFn: api.upcoming,
  });
  const screens = useQuery({
    queryKey: ["screenings-upcoming", cinema, date],
    queryFn: () => api.advanceScreenings(new URLSearchParams({ cinema, date })),
  });
  return (
    <section className="section">
      <span className="eyebrow">Advance tickets</span>
      <h1 className="page-title">Coming soon.</h1>
      <p className="page-intro">
        Lock in seats now for films opening soon — pick a cinema and date to
        pre-book ahead of release.
      </p>
      <div className="filters card coming-soon-filters">
        <div className="filter-heading">
          <span className="eyebrow">Pre-book ahead</span>
          <strong>{movies.data?.length || 0} upcoming</strong>
        </div>
        <label>
          Cinema
          <select value={cinema} onChange={(e) => setCinema(e.target.value)}>
            <option value="edinburgh">Edinburgh</option>
            <option value="glasgow">Glasgow</option>
            <option value="london">London West End</option>
          </select>
        </label>
        <label>
          Advance date
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      {movies.isLoading || screens.isLoading ? (
        <div className="empty">Loading upcoming releases…</div>
      ) : movies.isError ? (
        <div className="empty">Upcoming releases are temporarily unavailable.</div>
      ) : (
        <div className="screening-list">
          {movies.data?.map((movie) => {
            const times =
              screens.data?.filter((s) => s.movieId === movie.id) || [];
            return (
              <article className="screening card" key={movie.id}>
                <img src={poster(movie.poster_path)} alt="" />
                <div>
                  <span className="badge">{movie.rating || "NR"}</span>
                  <h2>{movie.title}</h2>
                  <p>{movie.overview}</p>
                  {movie.release_date && (
                    <p className="release-note">
                      In cinemas from {movie.release_date}
                    </p>
                  )}
                  {times.length ? (
                    <div className="times">
                      {times.map((s) => (
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
                  ) : (
                    <p className="release-note">
                      No advance screenings on this date yet — try another
                      date above.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
