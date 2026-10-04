import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { ApiError, api, money, showDate } from "../lib/api";
import {
  useProfile,
  useReservationPaymentIntent,
  useSession,
} from "../lib/hooks";
import { minimumAgeFor } from "../lib/age";
import type {
  AgeConfirmation,
  PaymentIntentResponse,
  Screening,
  Seat,
} from "../types";
import { AgeGate } from "../components/AgeGate";
import { PaymentForm } from "../components/PaymentForm";
import { bookingRoute } from "../routes";
import { useDelayedClose } from "../lib/useDelayedClose";

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
  const { closing: checkoutClosing, close: closeCheckout } = useDelayedClose(() =>
    setCheckout(false),
  );
  const session = useSession();
  const profile = useProfile(Boolean(session));
  useEffect(() => {
    if (session?.user.email) setEmail((current) => current || session.user.email!);
  }, [session]);
  // An ID-verified account has a checked date of birth: no need to ask again.
  const verified = profile.data?.identity.status === "verified" ? profile.data : null;
  const rating = detail.data?.rating;
  useEffect(() => {
    if (!verified || !rating || age) return;
    if (verified.age !== null && verified.age >= minimumAgeFor(rating) && verified.ageBand)
      setAge({
        rating,
        ageBand: verified.ageBand,
        declared: true,
        policyVersion: "uk-2026-1",
        confirmedAt: new Date().toISOString(),
      });
  }, [verified, rating, age]);
  const [freeError, setFreeError] = useState("");
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
  const finish = async (reference: string) => {
    await api.emailTicket(reference).catch(() => null);
    navigate({ to: "/confirmation", search: { reference } });
  };
  const confirm = async (paymentIntentId: string) => {
    if (!hold) return;
    const booking = await api.pay({ reservationId: hold, email, paymentIntentId });
    await finish(booking.reference);
  };
  const confirmFree = useMutation({
    mutationFn: () => api.confirmFree(hold!, email, promoCode || undefined),
    onSuccess: (booking) => finish(booking.reference),
    onError: (error) => setFreeError(error.message),
  });
  const needsId =
    reservation.error instanceof ApiError &&
    reservation.error.code === "ID_VERIFICATION_REQUIRED";
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
              <strong>{showDate(detail.data.date)}</strong>
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
          {!session && (
            <p className="muted small">
              <Link to="/account">Sign in</Link> to save this ticket to your
              account, use saved cards and get member or student discounts.
            </p>
          )}
          {reservation.error && (
            <p className="error" role="alert">
              {reservation.error.message}{" "}
              {needsId && (
                <Link to="/account" search={{ tab: "verification" }}>
                  Verify your ID
                </Link>
              )}
            </p>
          )}
        </aside>
      </div>
      {checkout && (
        <div className={`modal${checkoutClosing ? " is-closing" : ""}`}>
          {paymentIntent.data?.free ? (
            <div className="payment card">
              <span className="eyebrow">Member benefit</span>
              <h2>Nothing to pay</h2>
              <DiscountSummary data={paymentIntent.data} />
              {freeError && (
                <p className="error" role="alert">
                  {freeError}
                </p>
              )}
              <div className="ticket-actions">
                <button
                  className="button"
                  disabled={confirmFree.isPending}
                  onClick={() => confirmFree.mutate()}
                >
                  {confirmFree.isPending ? "Confirming…" : "Confirm free booking"}
                </button>
                <button className="button secondary" onClick={closeCheckout}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <PaymentForm
              clientSecret={paymentIntent.data?.clientSecret ?? null}
              customerSessionClientSecret={
                paymentIntent.data?.customerSessionClientSecret
              }
              amountPence={paymentIntent.data?.amountPence ?? total}
              label="Confirm booking"
              onSuccess={confirm}
              onCancel={closeCheckout}
            >
              {paymentIntent.isError && (
                <p className="error">{(paymentIntent.error as Error).message}</p>
              )}
              {paymentIntent.data && <DiscountSummary data={paymentIntent.data} />}
            </PaymentForm>
          )}
        </div>
      )}
    </section>
  );
}

function DiscountSummary({ data }: { data: PaymentIntentResponse }) {
  if (!data.discountPence) return null;
  return (
    <div className="discount-summary" role="status">
      <p>
        <BadgeCheck size={16} aria-hidden="true" />{" "}
        {data.discountLabels?.join(" · ") || "Discount applied"}
      </p>
      <p>
        {data.fullPence !== undefined && <s>{money(data.fullPence)}</s>}{" "}
        <strong>{money(data.amountPence)}</strong>{" "}
        <small>you save {money(data.discountPence)}</small>
      </p>
    </div>
  );
}
