import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api, money } from "../lib/api";
import type { Booking } from "../types";
import { confirmationRoute } from "../routes";

export function Confirmation() {
  const { reference } = confirmationRoute.useSearch();
  const booking = useQuery({
    queryKey: ["booking", reference],
    queryFn: () =>
      fetch(`/api/bookings/${reference}`).then(
        (r) => r.json() as Promise<Booking>,
      ),
  });
  const ticketData = useQuery({
    queryKey: ["ticket-data", reference],
    queryFn: () => api.ticketData(reference),
    enabled: Boolean(booking.data),
  });
  const resend = useMutation({ mutationFn: () => api.resendTicket(reference) });
  return (
    <section className="section narrow">
      {booking.data ? (
        <article className="ticket card professional-ticket">
          <span className="success">
            <Check size={24} aria-hidden="true" />
          </span>
          <span className="eyebrow">
            Booking confirmed · {booking.data.reference}
          </span>
          <h1>{booking.data.screening.movieTitle}</h1>
          <p>
            {booking.data.screening.date} · {booking.data.screening.time} ·{" "}
            {booking.data.screening.experience.name}
          </p>
          <p>
            Seats{" "}
            {booking.data.seats.map((s) => `${s.row}${s.number}`).join(", ")}
          </p>
          <strong>{money(booking.data.totalPence)}</strong>
          <p>
            Ticket delivery: {booking.data.emailDelivery?.status || "queued"}
          </p>
          <div className="ticket-qr">
            {ticketData.data ? (
              <img
                src={ticketData.data.qrDataUrl}
                alt="Booking entry QR code"
              />
            ) : (
              <span>Generating QR…</span>
            )}
            <small>Scan at the auditorium entrance</small>
          </div>
          <div className="ticket-actions">
            <a className="button" href={`/api/tickets/${reference}/download`}>
              Download PDF
            </a>
            <button
              className="button secondary"
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              {resend.isPending ? "Sending…" : "Resend email"}
            </button>
          </div>
          {resend.data?.previewUrl && (
            <a href={resend.data.previewUrl} target="_blank">
              Open local email preview
            </a>
          )}
        </article>
      ) : (
        <div className="empty">Loading ticket…</div>
      )}
    </section>
  );
}
