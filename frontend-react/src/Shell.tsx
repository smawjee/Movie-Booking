import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Search, CircleUserRound } from "lucide-react";
import { ChatAssistant } from "./components/ChatAssistant";

export function Shell() {
  const [siteSearch, setSiteSearch] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="header">
        <Link to="/" className="brand">
          <img src="/cinego-logo.svg" alt="Cinego" />
        </Link>
        <nav>
          <Link to="/movies">Movies</Link>
          <Link to="/coming-soon">Coming soon</Link>
          <Link to="/premium">Premium screens</Link>
          <Link to="/food">Food & drinks</Link>
          <Link to="/membership">Membership</Link>
          <Link to="/account">Account</Link>
        </nav>
        <form
          className="nav-search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ to: "/movies", search: { movie: siteSearch } });
          }}
        >
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search films"
            placeholder="Search films"
            value={siteSearch}
            onChange={(event) => setSiteSearch(event.target.value)}
          />
        </form>
        <Link to="/membership" className="nav-member">
          Cinego+
        </Link>
        <Link to="/account" className="nav-account" aria-label="Your account">
          <CircleUserRound size={18} aria-hidden="true" />
        </Link>
      </header>
      <main id="content">
        <Outlet />
      </main>
      <ChatAssistant />
      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/cinego-logo.svg" alt="Cinego" />
            <p>Big stories. Better nights out.</p>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/movies">Movies</Link>
            <Link to="/coming-soon">Coming soon</Link>
            <Link to="/premium">Premium screens</Link>
            <Link to="/food">Food & drinks</Link>
          </div>
          <div>
            <h3>Your account</h3>
            <Link to="/membership">Cinego+ membership</Link>
            <Link to="/account">Sign in / sign up</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Cinego</span>
          <span>Portfolio demonstration project · payments run in Stripe test mode</span>
        </div>
      </footer>
    </>
  );
}
