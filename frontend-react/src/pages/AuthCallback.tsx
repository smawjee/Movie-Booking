import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function AuthCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    const timer = window.setTimeout(() => navigate({ to: "/account" }), 900);
    return () => window.clearTimeout(timer);
  }, [navigate]);
  return (
    <section className="section narrow">
      <div className="empty">Completing secure sign-in…</div>
    </section>
  );
}
