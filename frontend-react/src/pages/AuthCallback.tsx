import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

/** OAuth errors come back in the query string or the hash, depending on the flow. */
function callbackError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return (
    params.get("error_description") ||
    hash.get("error_description") ||
    params.get("error") ||
    hash.get("error")
  );
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(callbackError);
  useEffect(() => {
    if (error || !supabase) return;
    const done = () => navigate({ to: "/account", replace: true });
    // supabase-js reads the tokens from the URL as it starts up; wait for
    // that to produce a session rather than guessing how long it takes.
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) done();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) done();
    });
    const timer = window.setTimeout(
      () => setError("Sign-in did not complete. Please try again."),
      10000,
    );
    return () => {
      listener.data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [error, navigate]);
  return (
    <section className="section narrow">
      {error ? (
        <div className="empty" role="alert">
          {error} <Link to="/account">Back to sign in</Link>
        </div>
      ) : (
        <div className="empty">Completing secure sign-in…</div>
      )}
    </section>
  );
}
