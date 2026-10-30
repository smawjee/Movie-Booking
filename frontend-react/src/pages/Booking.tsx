import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Armchair,
  BadgeCheck,
  CalendarDays,
  Clock,
  MapPin,
  X,
} from "lucide-react";
import { ApiError, api, money, poster, showDate } from "../lib/api";
import { useCinemaLookup } from "../components/CinemaSelect";
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

// The reservation API accepts at most this many seats per booking.
const MAX_SEATS = 12;

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
  const cinemaName = useCinemaLookup();
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
    // Someone may have taken a seat meanwhile: show the current map and
    // drop seats that are no longer free.
    onError: async () => {
      const fresh = await seatsQuery.refetch();
      const free = new Set(
        fresh.data?.seats.filter((s) => s.available).map((s) => s.id),
      );
      if (fresh.data) setSelected((v) => v.filter((s) => free.has(s.id)));
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
    return <section className="section empty loading">Loading screening…</section>;
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
        {session && profile.isLoading ? (
          <div className="empty loading">Loading your account…</div>
        ) : (
          <AgeGate
            rating={detail.data.rating}
            onConfirm={setAge}
            accountAge={profile.data?.age ?? null}
          />
        )}
      </section>
    );
  const toggle = (seat: Seat) =>
    setSelected((v) =>
      v.some((x) => x.id === seat.id)
        ? v.filter((x) => x.id !== seat.id)
        : [...v, seat],
    );
  const rows = [
    ...(seatsQuery.data?.seats || []).reduce(
      (map, seat) => map.set(seat.row, [...(map.get(seat.row) || []), seat]),
      new Map<string, Seat[]>(),
    ),
  ];
  const s = detail.data;
  return (
    <section className="section booking-page">
      <header className="booking-head">
        <img src={poster(s.posterPath, 185)} alt="" />
        <div>
          <span className="eyebrow">{s.experience.name}</span>
          <h1>{s.movieTitle}</h1>
          <ul className="booking-chips">
            <li>
              <CalendarDays size={14} aria-hidden="true" /> {showDate(s.date)}
            </li>
            <li>
              <Clock size={14} aria-hidden="true" /> {s.time}
            </li>
            <li>
              <MapPin size={14} aria-hidden="true" />{" "}
              {cinemaName(s.cinema)?.city || s.cinema} · Screen {s.screen}
            </li>
            <li className="badge">{s.rating}</li>
          </ul>
        </div>
      </header>
      {s.experience.warning && (
        <p className="warning">{s.experience.warning}</p>
      )}
      <div className="booking-grid">
        <div className="seat-card card">
          <div className="screen" aria-hidden="true">
            Screen
          </div>
          <div className="seats" role="group" aria-label="Seat map">
            {rows.map(([row, seats]) => (
              <div className="seat-row" key={row}>
                <span className="row-label">{row}</span>
                {seats.map((seat, i) => {
                  const isSelected = selected.some((x) => x.id === seat.id);
                  // Aisles split a 12-seat row 4-4-4 and an 8-seat row 4-4.
                  const aisle = i > 0 && i % 4 === 0;
                  return (
                    <Fragment key={seat.id}>
                      {aisle && <span className="aisle" />}
                      <button
                        type="button"
                        disabled={
                          !seat.available ||
                          (selected.length >= MAX_SEATS && !isSelected)
                        }
                        aria-pressed={isSelected}
                        aria-label={`Seat ${seat.row}${seat.number}, ${seat.tier}, ${money(seat.pricePence)}${seat.available ? "" : ", taken"}`}
                        className={`${seat.tier}${isSelected ? " selected" : ""}`}
                        onClick={() => toggle(seat)}
                      >
                        {seat.number}
                      </button>
                    </Fragment>
                  );
                })}
                <span className="row-label">{row}</span>
              </div>
            ))}
          </div>
          <ul className="seat-key">
            <li>
              <i className="seat-dot" /> Standard
            </li>
            <li>
              <i className="seat-dot premium" /> Premium +£2.50
            </li>
            <li>
              <i className="seat-dot selected" /> Your seats
            </li>
            <li>
              <i className="seat-dot unavailable" /> Taken
            </li>
          </ul>
        </div>
        <aside className="summary card">
          <h2>Your seats</h2>
          {selected.length ? (
            <ul className="seat-chips">
              {selected.map((seat) => (
                <li key={seat.id}>
                  <button
                    type="button"
                    className={seat.tier}
                    onClick={() => toggle(seat)}
                    aria-label={`Remove seat ${seat.row}${seat.number}`}
                  >
                    <strong>
                      {seat.row}
                      {seat.number}
                    </strong>
                    <small>{money(seat.pricePence)}</small>
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="summary-empty">
              <Armchair size={18} aria-hidden="true" /> Tap seats on the map to
              add them.
            </p>
          )}
          <div className="summary-total">
            <span>
              {selected.length} {selected.length === 1 ? "ticket" : "tickets"}
            </span>
            <strong>{money(total)}</strong>
          </div>
          {selected.length >= MAX_SEATS && (
            <p className="muted small">Up to {MAX_SEATS} seats per booking.</p>
          )}
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
