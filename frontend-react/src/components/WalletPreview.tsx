import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, showDate } from "../lib/api";
import { useDelayedClose } from "../lib/useDelayedClose";
import { useCinemaLookup } from "./CinemaSelect";

/** Shown instead of the real wallet hand-off until wallet credentials exist:
 *  the same pass content (film, time, seats, entry QR) the wallet would hold. */
export function WalletPreview({
  reference,
  wallet,
  onClose,
}: {
  reference: string;
  wallet: "apple" | "google";
  onClose: () => void;
}) {
  const { closing, close } = useDelayedClose(onClose);
  const cinema = useCinemaLookup();
  const booking = useQuery({
    queryKey: ["booking", reference],
    queryFn: () => api.booking(reference),
  });
  const ticket = useQuery({
    queryKey: ["ticket-data", reference],
    queryFn: () => api.ticketData(reference),
  });
  const name = wallet === "apple" ? "Apple Wallet" : "Google Wallet";
  const s = booking.data?.screening;
  return (
    <div className={`modal${closing ? " is-closing" : ""}`} onClick={close}>
      <div
        className="payment card wallet-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} pass preview`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="payment-close"
          onClick={close}
          aria-label="Close preview"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <span className="eyebrow">{name} · preview</span>
        <p className="muted small">
          Wallet isn’t connected on this site yet, so this is the pass you’d
          get. It scans at the door just like the real one.
        </p>
        {!s ? (
          <div className="empty">
            {booking.isError ? "Couldn’t load this ticket." : "Loading pass…"}
          </div>
        ) : (
          <div className={`wallet-pass ${wallet}`}>
            <div className="wallet-pass-head">
              <img src="/cinego-logo.svg" alt="Cinego" />
              <span>{reference}</span>
            </div>
            <small>FILM</small>
            <strong className="wallet-pass-film">{s.movieTitle}</strong>
            <div className="wallet-pass-fields">
              <span>
                <small>DATE</small>
                {showDate(s.date)}
              </span>
              <span>
                <small>TIME</small>
                {s.time}
              </span>
              <span>
                <small>CINEMA</small>
                {cinema(s.cinema)?.name || s.cinema}
              </span>
              <span>
                <small>SCREEN</small>
                {s.screen} · {s.experience.name}
              </span>
              <span>
                <small>SEATS</small>
                {booking
                  .data!.seats.map((x) => `${x.row}${x.number}`)
                  .join(", ")}
              </span>
              <span>
                <small>RATING</small>
                {s.rating}
              </span>
            </div>
            <div className="wallet-pass-qr">
              {ticket.data ? (
                <img src={ticket.data.qrDataUrl} alt="Entry QR code" />
              ) : (
                <span>Generating QR…</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
