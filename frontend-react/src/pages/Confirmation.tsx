import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { api, money, showDate } from "../lib/api";
import { confirmationRoute } from "../routes";
import { TicketActions } from "../components/TicketActions";
import { useCinemaLookup } from "../components/CinemaSelect";

export function Confirmation() {
  const { reference } = confirmationRoute.useSearch();
  const booking = useQuery({
    queryKey: ["booking", reference],
    queryFn: () => api.booking(reference),
    enabled: Boolean(reference),
  });
  const ticketData = useQuery({
    queryKey: ["ticket-data", reference],
    queryFn: () => api.ticketData(reference),
    enabled: Boolean(booking.data),
  });
  const delivery = booking.data?.emailDelivery;
  const cinema = useCinemaLookup();
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
          <dl className="ticket-facts">
            <div>
              <dt>Date</dt>
              <dd>{showDate(booking.data.screening.date)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{booking.data.screening.time}</dd>
            </div>
            <div>
              <dt>Cinema</dt>
              <dd>
                {cinema(booking.data.screening.cinema)?.city ||
                  booking.data.screening.cinema}{" "}
                · Screen {booking.data.screening.screen}
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{booking.data.screening.experience.name}</dd>
            </div>
            <div>
              <dt>{booking.data.seats.length === 1 ? "Seat" : "Seats"}</dt>
              <dd>
                {booking.data.seats
                  .map((s) => `${s.row}${s.number}`)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{money(booking.data.totalPence)}</dd>
            </div>
          </dl>
          <p className="ticket-delivery">
            {delivery?.status === "sent"
              ? "Ticket email sent to your booking email address."
              : delivery?.status === "preview"
                ? "Email delivery is not configured. Download your ticket or open the email preview below."
                : delivery?.status === "failed"
                  ? "Email delivery failed. Your booking is confirmed; you can retry below."
                  : "Your ticket is ready. Send it to your booking email address below."}
          </p>
          <div className="ticket-qr">
            {ticketData.data ? (
              <img
                src={ticketData.data.qrDataUrl}
                alt="Booking entry QR code"
              />
            ) : (
              <span>
                {ticketData.isError
                  ? "QR unavailable. Download your PDF ticket or retry."
                  : "Generating QR…"}
                {ticketData.isError && (
                  <button onClick={() => void ticketData.refetch()}>
                    Retry
                  </button>
                )}
              </span>
            )}
            <small>Scan at the auditorium entrance</small>
          </div>
          <TicketActions
            reference={booking.data.reference}
            initialDelivery={delivery}
            onSent={() => void booking.refetch()}
          />
          <Link
            to="/account"
            search={{ tab: "tickets" }}
            className="text-button"
          >
            View all your tickets in your account
          </Link>
        </article>
      ) : (
        <div className="empty" role="status">
          {!reference
            ? "No booking reference provided."
            : booking.isError
              ? booking.error.message
              : "Loading ticket…"}
        </div>
      )}
    </section>
  );
}
