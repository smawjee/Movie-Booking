import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { api, money, poster } from "../../lib/api";
import { useMyBookings } from "../../lib/hooks";
import { TicketActions } from "../TicketActions";
import type { Booking } from "../../types";

const startsAt = (b: Booking) =>
  new Date(`${b.screening.date}T${b.screening.time}:00`);

function TicketQr({ reference }: { reference: string }) {
  const data = useQuery({
    queryKey: ["ticket-data", reference],
    queryFn: () => api.ticketData(reference),
  });
  return (
    <div className="ticket-qr inline">
      {data.data ? (
        <img src={data.data.qrDataUrl} alt={`Entry QR code for ${reference}`} />
      ) : (
        <span>{data.isError ? "QR unavailable" : "Generating QR…"}</span>
      )}
      <small>Scan at the auditorium entrance</small>
    </div>
  );
}

function TicketRow({ booking, email }: { booking: Booking; email?: string }) {
  const [open, setOpen] = useState(false);
  const s = booking.screening;
  return (
    <li className="card my-ticket">
      <img src={poster(s.posterPath, 185)} alt="" />
      <div className="my-ticket-body">
        <span className="eyebrow">
          {booking.reference} · {s.experience?.name}
        </span>
        <h3>{s.movieTitle}</h3>
        <p>
          {startsAt(booking).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {s.time} · Screen {s.screen} · Seats{" "}
          {booking.seats.map((x) => `${x.row}${x.number}`).join(", ")}
        </p>
        <p className="muted small">Paid {money(booking.totalPence)}</p>
        <button
          className="text-button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <QrCode size={15} aria-hidden="true" />
          {open ? "Hide ticket" : "Show ticket"}
        </button>
        {open && (
          <div className="my-ticket-detail">
            <TicketQr reference={booking.reference} />
            <TicketActions reference={booking.reference} bookingEmail={email} />
          </div>
        )}
      </div>
    </li>
  );
}

export function MyTickets({ email }: { email?: string }) {
  const bookings = useMyBookings(true);
  const [showPast, setShowPast] = useState(false);
  if (bookings.isLoading) return <div className="empty">Loading your tickets…</div>;
  if (bookings.isError)
    return (
      <div className="empty" role="alert">
        {(bookings.error as Error).message}{" "}
        <button onClick={() => void bookings.refetch()}>Try again</button>
      </div>
    );
  // A screening counts as upcoming until 3 hours after it starts.
  const cutoff = Date.now() - 3 * 3600000;
  const upcoming = (bookings.data || [])
    .filter((b) => startsAt(b).getTime() >= cutoff)
    .sort((a, b) => startsAt(a).getTime() - startsAt(b).getTime());
  const past = (bookings.data || []).filter(
    (b) => startsAt(b).getTime() < cutoff,
  );
  const list = showPast ? past : upcoming;
  return (
    <div className="account-section">
      <div className="section-head">
        <h2>Your tickets</h2>
        <div className="segmented small" role="tablist">
          <button
            role="tab"
            aria-selected={!showPast}
            className={!showPast ? "active" : undefined}
            onClick={() => setShowPast(false)}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            role="tab"
            aria-selected={showPast}
            className={showPast ? "active" : undefined}
            onClick={() => setShowPast(true)}
          >
            Past ({past.length})
          </button>
        </div>
      </div>
      {list.length ? (
        <ul className="my-tickets">
          {list.map((b) => (
            <TicketRow key={b.reference} booking={b} email={email} />
          ))}
        </ul>
      ) : (
        <div className="empty">
          {showPast ? "No past bookings yet." : "No upcoming bookings."}{" "}
          <Link to="/movies">Find a film</Link>
        </div>
      )}
    </div>
  );
}
