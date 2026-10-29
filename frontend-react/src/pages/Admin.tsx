import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { admin, money, showDate } from "../lib/api";
import { useProfile, useSession } from "../lib/hooks";
import { NotFound } from "./NotFound";
import { useCinemaLookup } from "../components/CinemaSelect";
import type { AdminBooking, AdminOverview } from "../types";

type Tab = "overview" | "bookings" | "check";
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "bookings", label: "Bookings" },
  { id: "check", label: "Check tickets" },
];

export function Admin() {
  const session = useSession();
  const profile = useProfile(Boolean(session));
  const [tab, setTab] = useState<Tab>("overview");
  if (session === undefined || (session && profile.isLoading))
    return <section className="section narrow empty">Loading…</section>;
  // Non-admins get the ordinary 404, so the page doesn't advertise itself.
  if (!session || !profile.data?.isAdmin) return <NotFound />;
  return (
    <section className="section admin-page">
      <span className="eyebrow">Admin</span>
      <h1 className="page-title">Cinego dashboard</h1>
      <div
        className="segmented account-tabs"
        role="tablist"
        aria-label="Admin sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "bookings" && <Bookings />}
      {tab === "check" && <CheckTickets />}
    </section>
  );
}

function Overview() {
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: admin.overview,
  });
  if (overview.isLoading) return <div className="empty">Loading figures…</div>;
  if (overview.isError)
    return (
      <p className="error" role="alert">
        {overview.error.message}
      </p>
    );
  const data = overview.data as AdminOverview;
  const peak = Math.max(1, ...data.daily.map((d) => d.revenuePence));
  const periods = [
    ["Today", data.today],
    ["Last 7 days", data.week],
    ["Last 30 days", data.month],
  ] as const;
  return (
    <div className="admin-grid">
      <div className="admin-stats">
        {periods.map(([label, period]) => (
          <div className="card admin-stat" key={label}>
            <small>{label}</small>
            <strong>{money(period.revenuePence)}</strong>
            <span>
              {period.tickets} tickets · {period.bookings} bookings
            </span>
          </div>
        ))}
        <div className="card admin-stat">
          <small>Members</small>
          <strong>{data.activeMemberships}</strong>
          <span>{data.accounts} accounts</span>
        </div>
      </div>
      <div className="card admin-chart">
        <h2>Revenue, last 14 days</h2>
        <div className="admin-bars" role="list">
          {data.daily.map((day) => (
            <div
              key={day.date}
              role="listitem"
              className="admin-bar"
              title={`${showDate(day.date)}: ${money(day.revenuePence)} from ${day.bookings} bookings`}
            >
              <span style={{ height: `${(day.revenuePence / peak) * 100}%` }} />
              <small>{day.date.slice(8)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>Top films, last 30 days</h2>
        {data.topFilms.length ? (
          <ol className="admin-list">
            {data.topFilms.map((film) => (
              <li key={film.title}>
                <span>{film.title}</span>
                <strong>{film.tickets} tickets</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No bookings yet.</p>
        )}
      </div>
      <div className="card">
        <h2>Ticket emails</h2>
        <ul className="admin-list">
          {Object.entries(data.emails).map(([status, count]) => (
            <li key={status}>
              <span className={`status-pill ${status}`}>{status}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Bookings() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const bookings = useQuery({
    queryKey: ["admin", "bookings", search],
    queryFn: () => admin.bookings(search),
  });
  const resend = useMutation({ mutationFn: admin.resend });
  const cinema = useCinemaLookup();
  return (
    <div className="account-section">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
        }}
      >
        <label>
          Search by reference or email
          <input
            type="search"
            value={query}
            placeholder="CG-… or name@example.com"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="button secondary">Search</button>
      </form>
      {resend.isSuccess && (
        <p className="auth-message" role="status">
          Ticket{" "}
          {resend.data.status === "sent" ? "emailed" : "prepared as a preview"}.
        </p>
      )}
      {resend.error && (
        <p className="error" role="alert">
          {resend.error.message}
        </p>
      )}
      {bookings.isLoading ? (
        <div className="empty">Loading bookings…</div>
      ) : bookings.isError ? (
        <p className="error" role="alert">
          {bookings.error.message}
        </p>
      ) : !bookings.data?.length ? (
        <div className="empty">No bookings match.</div>
      ) : (
        <div className="admin-table-wrap card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Film</th>
                <th>Showing</th>
                <th>Seats</th>
                <th>Total</th>
                <th>Email</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bookings.data.map((b: AdminBooking) => (
                <tr key={b.reference}>
                  <td>
                    <code>{b.reference}</code>
                  </td>
                  <td>{b.film}</td>
                  <td>
                    {showDate(b.date)} {b.time}
                    <small>
                      {cinema(b.cinema)?.city || b.cinema} · Screen {b.screen}
                    </small>
                  </td>
                  <td>{b.seats.join(", ")}</td>
                  <td>{money(b.totalPence)}</td>
                  <td>
                    {b.email || <span className="muted">deleted</span>}
                    {b.emailStatus && (
                      <small className={`status-pill ${b.emailStatus}`}>
                        {b.emailStatus}
                      </small>
                    )}
                  </td>
                  <td>
                    {b.email && (
                      <button
                        className="text-button"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(b.reference)}
                      >
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CheckTickets() {
  const [code, setCode] = useState("");
  const check = useMutation({ mutationFn: admin.verify });
  const cinema = useCinemaLookup();
  const result = check.data;
  return (
    <div className="account-section">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) check.mutate(code.trim());
        }}
      >
        <label>
          Ticket QR contents or booking reference
          <input
            value={code}
            placeholder="Scan into this box, or type CG-…"
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </label>
        <button className="button" disabled={check.isPending}>
          {check.isPending ? "Checking…" : "Check ticket"}
        </button>
      </form>
      {check.error && (
        <p className="error" role="alert">
          {check.error.message}
        </p>
      )}
      {result && (
        <div
          className={`card admin-check ${result.valid ? "valid" : "invalid"}`}
          role="status"
        >
          {result.valid ? (
            <>
              <strong>Valid ticket · {result.reference}</strong>
              <p>
                {result.film} ({result.rating}) · {showDate(result.date!)} at{" "}
                {result.time}
              </p>
              <p>
                {cinema(result.cinema!)?.city || result.cinema} · Screen{" "}
                {result.screen} · Seats {result.seats!.join(", ")}
              </p>
            </>
          ) : (
            <strong>Not valid: {result.reason}</strong>
          )}
        </div>
      )}
    </div>
  );
}
