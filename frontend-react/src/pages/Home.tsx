import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, poster } from "../lib/api";
import { PageHero } from "../components/PageHero";
import type { Movie } from "../types";

function MovieCard({ movie }: { movie: Movie }) {
  return (
    <article className="movie">
      <div className="movie-poster">
        <img src={poster(movie.poster_path)} alt={`${movie.title} poster`} />
        <span className="badge movie-rating">{movie.rating || "NR"}</span>
      </div>
      <h3>{movie.title}</h3>
      <Link className="button" to="/movies" search={{ movie: movie.title }}>
        Showtimes
      </Link>
    </article>
  );
}

export function Home() {
  const films = useQuery({ queryKey: ["movies"], queryFn: api.movies });
  const upcoming = useQuery({
    queryKey: ["movies-upcoming"],
    queryFn: api.upcoming,
  });
  return (
    <>
      <PageHero
        as="h1"
        eyebrow="Your next night out"
        title={
          <>
            Big stories belong on the <em>big screen.</em>
          </>
        }
        copy="Discover films, premium experiences and the perfect seats."
        cta={
          <Link className="button" to="/movies" search={{}}>
            Explore showtimes
          </Link>
        }
      />
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Now showing</span>
            <h2>Popular this week</h2>
          </div>
        </div>
        {films.isLoading ? (
          <div className="empty">Loading films…</div>
        ) : films.isError ? (
          <div className="empty">Movies are temporarily unavailable.</div>
        ) : (
          <div className="movie-grid">
            {films.data?.slice(0, 8).map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Advance tickets</span>
            <h2>Coming soon</h2>
          </div>
          <Link className="button secondary" to="/coming-soon">
            Pre-book now
          </Link>
        </div>
        {upcoming.isLoading ? (
          <div className="empty">Loading upcoming releases…</div>
        ) : upcoming.isError ? (
          <div className="empty">Upcoming releases are temporarily unavailable.</div>
        ) : (
          <div className="movie-grid">
            {upcoming.data?.slice(0, 4).map((m) => (
              <article className="movie" key={m.id}>
                <div className="movie-poster">
                  <img src={poster(m.poster_path)} alt={`${m.title} poster`} />
                  <span className="badge movie-rating">{m.rating || "NR"}</span>
                </div>
                <h3>{m.title}</h3>
                <Link className="button secondary" to="/coming-soon">
                  Pre-book
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
