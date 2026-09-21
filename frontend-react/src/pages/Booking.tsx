import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, money } from "../lib/api";
import { useReservationPaymentIntent } from "../lib/hooks";
import type { AgeConfirmation, Screening, Seat } from "../types";
import { AgeGate } from "../components/AgeGate";
import { PaymentForm } from "../components/PaymentForm";
import { bookingRoute } from "../routes";

export function Booking() {
  const { screening } = bookingRoute.useSearch();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["screening", screening],
    queryFn: () =>
      fetch(`/api/screenings/${screening}`).then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<Screening>;
      }),
  });
  const seatsQuery = useQuery({
    queryKey: ["seats", screening],
    queryFn: () => api.seats(screening) as Promise<{ seats: Seat[] }>,
  });
  const [age, setAge] = useState<AgeConfirmation | null>(null),
    [selected, setSelected] = useState<Seat[]>([]),
    [hold, setHold] = useState<string | null>(null),
    [email, setEmail] = useState(""),
    [promoCode, setPromoCode] = useState(""),
    [checkout, setCheckout] = useState(false);
  const reservation = useMutation({
    mutationFn: () =>
      api.reserve({
        screeningId: screening,
        seatIds: selected.map((s) => s.id),
        ageConfirmation: age,
      }),
    onSuccess: (x) => {
      setHold(x.id);
      setCheckout(true);
    },
  });
  const total = selected.reduce((s, x) => s + x.pricePence, 0);
  const paymentIntent = useReservationPaymentIntent(
    checkout ? hold : null,
    email,
    promoCode || undefined,
  );
  const confirm = async (paymentIntentId: string) => {
    if (!hold) return;
    const booking = await api.pay({ reservationId: hold, email, paymentIntentId });
    await api.emailTicket(booking.reference).catch(() => null);
    navigate({ to: "/confirmation", search: { reference: booking.reference } });
  };
  if (detail.isLoading)
    return <section className="section empty">Loading screening…</section>;
  if (!detail.data)
    return <section className="section empty">Screening unavailable.</section>;
  if (!age)
    return (
      <section className="section booking-entry">
        <div className="booking-context card">
          <span className="eyebrow">Before you choose seats</span>
          <h1>{detail.data.movieTitle}</h1>
          <div className="booking-facts">
            <span>
              <small>Date</small>
              <strong>{detail.data.date}</strong>
            </span>
            <span>
              <small>Time</small>
              <strong>{detail.data.time}</strong>
            </span>
            <span>
              <small>Screen</small>
              <strong>{detail.data.experience.name}</strong>
            </span>
            <span>
              <small>From</small>
              <strong>{money(detail.data.pricePence)}</strong>
            </span>
          </div>
          <p>
            Complete the quick age check, then you’ll see the live auditorium
            map and select exact seats.
          </p>
        </div>
        <AgeGate rating={detail.data.rating} onConfirm={setAge} />
      </section>
    );
  return (
    <section className="section">
      <span className="eyebrow">{detail.data.experience.name}</span>
      <h1>
        {detail.data.movieTitle} · {detail.data.time}
      </h1>
      {detail.data.experience.warning && (
        <p className="warning">{detail.data.experience.warning}</p>
      )}
      <div className="booking-grid">
        <div className="seat-card card">
          <div className="screen">SCREEN</div>
          <div className="seats">
            {seatsQuery.data?.seats.map((seat) => (
              <button
                key={seat.id}
                disabled={!seat.available}
                className={`${seat.tier} ${selected.some((x) => x.id === seat.id) ? "selected" : ""}`}
                onClick={() =>
                  setSelected((v) =>
                    v.some((x) => x.id === seat.id)
                      ? v.filter((x) => x.id !== seat.id)
                      : [...v, seat],
                  )
                }
              >
                {seat.row}
                {seat.number}
              </button>
            ))}
          </div>
        </div>
        <aside className="summary card">
          <h2>Your seats</h2>
          <p>
            {selected.map((s) => `${s.row}${s.number}`).join(", ") ||
              "Choose seats from the map."}
          </p>
          <strong>{money(total)}</strong>
          <label>
            Email for tickets
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Promo code (optional)
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="e.g. WELCOME10"
            />
          </label>
          <button
            className="button"
            disabled={!selected.length || !email}
            onClick={() => reservation.mutate()}
          >
            Hold seats and pay
          </button>
          {reservation.error && (
            <p className="error">{reservation.error.message}</p>
          )}
        </aside>
      </div>
      {checkout && (
        <div className="modal">
          <PaymentForm
            clientSecret={paymentIntent.data?.clientSecret ?? null}
            amountPence={paymentIntent.data?.amountPence ?? total}
            label="Confirm booking"
            onSuccess={confirm}
            onCancel={() => setCheckout(false)}
          >
            {paymentIntent.isError && (
              <p className="error">{(paymentIntent.error as Error).message}</p>
            )}
            {!!paymentIntent.data?.discountPence && (
              <p className="notice">
                Promo applied: −{money(paymentIntent.data.discountPence)}
              </p>
            )}
          </PaymentForm>
        </div>
      )}
    </section>
  );
}
