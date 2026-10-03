import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <section className="section narrow empty-state">
      <span className="eyebrow">404</span>
      <h1 className="page-title">This page isn’t showing.</h1>
      <p className="page-intro">
        The link may be old or mistyped. Try what’s on instead.
      </p>
      <div className="ticket-actions">
        <Link to="/movies" className="button">
          See what’s on
        </Link>
        <Link to="/" className="button secondary">
          Home
        </Link>
      </div>
    </section>
  );
}
