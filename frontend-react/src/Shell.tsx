import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CircleUserRound, Menu, X } from "lucide-react";
import { ChatAssistant } from "./components/ChatAssistant";
import { OffersBanner } from "./components/OffersBanner";
import { SearchSuggest } from "./components/SearchSuggest";

export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className={`header${menuOpen ? " menu-open" : ""}`}>
        <Link to="/" className="brand" aria-label="Cinego home" title="Home">
          <img src="/cinego-logo.svg" alt="Cinego" />
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav id="site-nav">
          <Link to="/" activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link to="/movies">Movies</Link>
          <Link to="/coming-soon">Coming soon</Link>
          <Link to="/trailers">Trailers</Link>
          <Link to="/premium">Premium screens</Link>
          <Link to="/food">Food & drinks</Link>
          <Link to="/membership">Membership</Link>
          <Link to="/account" className="nav-account-text">
            Account
          </Link>
        </nav>
        <SearchSuggest onNavigate={() => setMenuOpen(false)} />
        <Link to="/membership" className="nav-member">
          Cinego+
        </Link>
        <Link to="/account" className="nav-account" aria-label="Your account">
          <CircleUserRound size={18} aria-hidden="true" />
        </Link>
      </header>
      <OffersBanner />
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
            <Link to="/">Home</Link>
            <Link to="/movies">Movies</Link>
            <Link to="/coming-soon">Coming soon</Link>
            <Link to="/trailers">Trailers</Link>
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
          <span>
            Portfolio demonstration project · payments run in Stripe test mode
          </span>
        </div>
      </footer>
    </>
  );
}
