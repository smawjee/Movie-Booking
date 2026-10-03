import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Mail } from "lucide-react";
import { api, emailSchema } from "../lib/api";

type Delivery = { status: string; previewUrl?: string } | undefined;

/** Download the PDF, or email the ticket to the booking email or another one. */
export function TicketActions({
  reference,
  bookingEmail,
  initialDelivery,
  onSent,
}: {
  reference: string;
  bookingEmail?: string;
  initialDelivery?: Delivery;
  onSent?: () => void;
}) {
  const [otherEmail, setOtherEmail] = useState("");
  const [showOther, setShowOther] = useState(false);
  const download = useMutation({
    mutationFn: () => api.downloadTicket(reference),
  });
  const send = useMutation({
    mutationFn: (to?: string) => api.resendTicket(reference, to),
    onSettled: onSent,
  });
  const delivery = send.data || initialDelivery;
  const otherValid = emailSchema.safeParse(otherEmail.trim()).success;
  const sentTo = send.variables || bookingEmail || "your booking email";
  return (
    <div className="ticket-actions-block">
      <div className="ticket-actions">
        <button
          className="button"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download size={16} aria-hidden="true" />
          {download.isPending ? "Preparing PDF…" : "Download PDF"}
        </button>
        <button
          className="button secondary"
          disabled={send.isPending}
          onClick={() => send.mutate(undefined)}
        >
          <Mail size={16} aria-hidden="true" />
          {send.isPending && !send.variables
            ? "Sending…"
            : bookingEmail
              ? `Email to ${bookingEmail}`
              : "Email ticket"}
        </button>
        <button
          type="button"
          className="text-button"
          aria-expanded={showOther}
          onClick={() => setShowOther((open) => !open)}
        >
          Send to a different email
        </button>
      </div>
      {showOther && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (otherValid) send.mutate(otherEmail.trim());
          }}
        >
          <label>
            Email address
            <input
              type="email"
              required
              value={otherEmail}
              placeholder="friend@example.com"
              onChange={(event) => setOtherEmail(event.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={!otherValid || send.isPending}
          >
            {send.isPending && send.variables ? "Sending…" : "Send ticket"}
          </button>
        </form>
      )}
      {(send.error || download.error) && (
        <p className="error" role="alert">
          {(send.error || download.error)?.message}
        </p>
      )}
      {send.isSuccess && delivery?.status === "sent" && (
        <p className="auth-message" role="status">
          Ticket emailed to {sentTo}.
        </p>
      )}
      {delivery?.status === "preview" && (
        <p className="notice" role="status">
          Email delivery isn’t configured on this server yet.{" "}
          {delivery.previewUrl && (
            <a href={delivery.previewUrl} target="_blank" rel="noreferrer">
              Open the email preview
            </a>
          )}
        </p>
      )}
    </div>
  );
}
