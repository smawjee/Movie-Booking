// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, money, poster } from "./lib/api";
import type {
  AgeConfirmation,
  Booking,
  ExperienceId,
  Movie,
  PaymentSummary,
  Screening,
  Seat,
} from "./types";
import { AgeGate } from "./components/AgeGate";
import { PaymentForm } from "./components/PaymentForm";
import { ChatAssistant } from "./components/ChatAssistant";
import { AccountPanel } from "./components/AccountPanel";
const experiences: Record<
  ExperienceId,
  { name: string; copy: string; warning?: string }
> = {
  standard: {
    name: "Standard 2D",
    copy: "Crystal-clear projection and comfortable seating.",
  },
  "3d": {
    name: "RealD 3D",
    copy: "Immersive depth with lightweight 3D glasses.",
  },
  imax: { name: "IMAX", copy: "Floor-to-ceiling picture and precision sound." },
  dolby: {
    name: "Dolby Cinema",
    copy: "Dolby Vision, Atmos and luxury recliners.",
  },
  "4dx": {
    name: "4DX",
    copy: "Motion seats with wind, water and environmental effects.",
    warning:
      "Includes motion, water and flashing effects. Not recommended during pregnancy or for some medical conditions; height restrictions apply.",
  },
  screenx: {
    name: "ScreenX",
    copy: "A panoramic 270-degree cinema experience.",
  },
};
function Shell() {
  const [siteSearch, setSiteSearch] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="header">
        <Link to="/" className="brand">
          <img src="/cinego-logo.svg" alt="Cinego" />
        </Link>
        <nav>
          <Link to="/movies">Movies</Link>
          <Link to="/premium">Premium screens</Link>
          <Link to="/food">Food & drinks</Link>
          <Link to="/membership">Membership</Link>
          <Link to="/account">Account</Link>
        </nav>
        <form
          className="nav-search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ to: "/movies", search: { movie: siteSearch } });
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search films"
            placeholder="Search films"
            value={siteSearch}
            onChange={(event) => setSiteSearch(event.target.value)}
          />
        </form>
        <Link to="/membership" className="nav-member">
          Cinego+
        </Link>
        <Link to="/account" className="nav-account" aria-label="Your account">
          ●
        </Link>
      </header>
      <main id="content">
        <Outlet />
      </main>
      <ChatAssistant />
      <footer>
        <img src="/cinego-logo.svg" alt="Cinego" />
        <p>Big stories. Better nights out. · Portfolio demonstration</p>
      </footer>
    </>
  );
}
function MovieCard({ movie }: { movie: Movie }) {
  return (
    <article className="movie">
      <img src={poster(movie.poster_path)} alt={`${movie.title} poster`} />
      <h3>{movie.title}</h3>
      <span className="badge">{movie.rating || "NR"}</span>
      <Link className="button" to="/movies" search={{ movie: movie.title }}>
        Showtimes
      </Link>
    </article>
  );
}
function Home() {
  const films = useQuery({ queryKey: ["movies"], queryFn: api.movies });
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Your next night out</span>
          <h1>
            Big stories belong on the <em>big screen.</em>
          </h1>
          <p>Discover films, premium experiences and the perfect seats.</p>
          <Link className="button" to="/movies" search={{}}>
            Explore showtimes
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Now showing</span>
            <h2>Popular this week</h2>
          </div>
        </div>
        {films.isLoading ? (
          <div className="empty">Loading films…</div>
        ) : films.isError ? (
          <div className="empty">Movies are temporarily unavailable.</div>
        ) : (
          <div className="movie-grid">
            {films.data?.slice(0, 8).map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function Movies() {
  const search = moviesRoute.useSearch();
  const films = useQuery({ queryKey: ["movies"], queryFn: api.movies });
  const [cinema, setCinema] = useState("edinburgh"),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [format, setFormat] = useState(""),
    [title, setTitle] = useState(search.movie || ""),
    [rating, setRating] = useState(""),
    [genre, setGenre] = useState("");
  const screens = useQuery({
    queryKey: ["screenings", cinema, date, format],
    queryFn: () =>
      api.screenings(
        new URLSearchParams({ cinema, date, ...(format && { format }) }),
      ),
  });
  const list =
    films.data?.filter(
      (m) =>
        (!title || m.title.toLowerCase().includes(title.toLowerCase())) &&
        (!rating || m.rating === rating) &&
        (!genre || m.genre_ids.includes(Number(genre))),
    ) || [];
  return (
    <section className="section">
      <span className="eyebrow">Now showing</span>
      <h1 className="page-title">Choose your experience.</h1>
      <div className="filters card">
        <div className="filter-heading">
          <span className="eyebrow">Find your film</span>
          <strong>{list.length} results</strong>
        </div>
        <label className="filter-search">
          Film title
          <input
            type="search"
            value={title}
            placeholder="Search by title…"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Cinema
          <select value={cinema} onChange={(e) => setCinema(e.target.value)}>
            <option value="edinburgh">Edinburgh</option>
            <option value="glasgow">Glasgow</option>
            <option value="london">London West End</option>
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">All formats</option>
            {Object.entries(experiences).map(([id, x]) => (
              <option key={id} value={id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">All genres</option>
            <option value="28">Action</option>
            <option value="12">Adventure</option>
            <option value="35">Comedy</option>
            <option value="18">Drama</option>
            <option value="27">Horror</option>
            <option value="10751">Family</option>
          </select>
        </label>
        <label>
          Rating
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">All ratings</option>
            {["U", "PG", "12A", "15", "18"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          className="clear-filters"
          onClick={() => {
            setTitle("");
            setFormat("");
            setGenre("");
            setRating("");
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="active-filters">
        {[
          title,
          format && experiences[format].name,
          genre && "Genre selected",
          rating && `Rated ${rating}`,
        ]
          .filter(Boolean)
          .map((value) => (
            <span key={String(value)}>{value}</span>
          ))}
      </div>
      {films.isLoading || screens.isLoading ? (
        <div className="empty">Loading showtimes…</div>
      ) : (
        <div className="screening-list">
          {list.map((movie) => (
            <article className="screening card" key={movie.id}>
              <img src={poster(movie.poster_path)} alt="" />
              <div>
                <span className="badge">{movie.rating}</span>
                <h2>{movie.title}</h2>
                <p>{movie.overview}</p>
                <div className="times">
                  {screens.data
                    ?.filter((s) => s.movieId === movie.id)
                    .map((s) => (
                      <Link
                        key={s.id}
                        to="/booking"
                        search={{ screening: s.id }}
                        className={`time format-${s.experience.id}`}
                      >
                        <strong>{s.time}</strong>
                        <small>
                          {s.experience.name} · {money(s.pricePence)}
                        </small>
                      </Link>
                    ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function Premium() {
  return (
    <section className="section">
      <span className="eyebrow">Beyond standard</span>
      <h1 className="page-title">Six ways to feel every moment.</h1>
      <div className="premium-hero card">
        <img
          src="/images/premium-cinema.png"
          alt="Luxury Cinego auditorium with reclining seats"
        />
        <div>
          <span className="eyebrow">Made for the big screen</span>
          <h2>More picture. More sound. More cinema.</h2>
          <p>
            Compare every auditorium before choosing your film. Premium
            surcharges are always shown upfront.
          </p>
        </div>
      </div>
      <div className="experience-grid">
        {Object.entries(experiences).map(([id, x]) => (
          <article className={`experience card format-${id}`} key={id}>
            <div className={`experience-image experience-image-${id}`}>
              <img
                src={`/images/screen-${id}.png`}
                alt={`${x.name} auditorium`}
              />
              <span>{x.name}</span>
            </div>
            <div className="experience-body">
              <span className="eyebrow">{id.toUpperCase()}</span>
              <h2>{x.name}</h2>
              <p>{x.copy}</p>
              {x.warning && <p className="warning">{x.warning}</p>}
              <Link className="button secondary" to="/movies" search={{}}>
                Find showtimes
              </Link>
            </div>
          </article>
        ))}
      </div>
      <SeatPreview />
    </section>
  );
}

function SeatPreview() {
  const seats = Array.from({ length: 36 }, (_, index) => index);
  return (
    <section className="seat-preview card" aria-labelledby="seat-preview-title">
      <div className="seat-preview-copy">
        <span className="eyebrow">Know before you book</span>
        <h2 id="seat-preview-title">
          See exactly what the seat map looks like.
        </h2>
        <p>
          Every booking includes a live auditorium map. Standard seats offer a
          clear view, premium recliners add space, and accessible positions are
          clearly marked.
        </p>
        <div className="seat-legend">
          <span>
            <i className="seat-dot available" /> Available
          </span>
          <span>
            <i className="seat-dot premium" /> Premium recliner
          </span>
          <span>
            <i className="seat-dot selected" /> Your selection
          </span>
          <span>
            <i className="seat-dot unavailable" /> Unavailable
          </span>
        </div>
      </div>
      <div
        className="mini-auditorium"
        aria-label="Example auditorium seating plan"
      >
        <div className="mini-screen">SCREEN</div>
        <div className="mini-seats">
          {seats.map((seat) => (
            <span
              key={seat}
              className={`${seat > 23 ? "premium" : "available"} ${seat === 27 || seat === 28 ? "selected" : ""} ${[4, 10, 20].includes(seat) ? "unavailable" : ""}`}
            />
          ))}
        </div>
        <small>
          Illustrative layout — the live map updates for each screening.
        </small>
      </div>
    </section>
  );
}
function Booking() {
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
    [checkout, setCheckout] = useState(false);
  const reservation = useMutation({
    mutationFn: () =>
      api.reserve({
        screeningId: screening,
        seatIds: selected.map((s) => s.id),
        ageConfirmation: age,
      }),
    onSuccess: (x: any) => {
      setHold(x.id);
      setCheckout(true);
    },
  });
  const total = selected.reduce((s, x) => s + x.pricePence, 0);
  const confirm = async (payment: PaymentSummary) => {
    const booking = await api.pay({ reservationId: hold, email, payment });
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
            amountPence={total}
            label="Confirm booking"
            onSuccess={confirm}
            onCancel={() => setCheckout(false)}
          />
        </div>
      )}
    </section>
  );
}
function Membership() {
  const [chosen, setChosen] = useState<{ name: string; price: number } | null>(
    null,
  );
  const plans = [
    ["Silver", 499],
    ["Gold", 899],
    ["Platinum", 1499],
  ] as const;
  const pay = async (payment: PaymentSummary) => {
    await api.membershipPay({ plan: chosen?.name, payment });
    setChosen(null);
    alert("Membership activated");
  };
  return (
    <section className="section">
      <span className="eyebrow">Cinego members</span>
      <h1 className="page-title">More cinema. More rewards.</h1>
      <div className="plan-grid">
        {plans.map(([name, price]) => (
          <article className="plan card" key={name}>
            <h2>{name}</h2>
            <strong>
              {money(price)} <small>/ month</small>
            </strong>
            <ul>
              <li>Member ticket savings</li>
              <li>Priority booking</li>
              <li>Exclusive rewards</li>
            </ul>
            <button
              className="button"
              onClick={() => setChosen({ name, price })}
            >
              Choose {name}
            </button>
          </article>
        ))}
      </div>
      {chosen && (
        <div className="modal">
          <PaymentForm
            amountPence={chosen.price}
            label={`Join ${chosen.name}`}
            onSuccess={pay}
            onCancel={() => setChosen(null)}
          />
        </div>
      )}
    </section>
  );
}
function Confirmation() {
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
          <span className="success">✓</span>
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
function Food() {
  const products = [
    {
      name: "Sweet Popcorn",
      copy: "Freshly popped, warm and generously coated.",
      price: 399,
      crop: "popcorn",
      tag: "Vegetarian",
    },
    {
      name: "Loaded Nachos",
      copy: "Cheese sauce, tomato salsa and jalapeños.",
      price: 524,
      crop: "nachos",
      tag: "Vegetarian",
    },
    {
      name: "Movie Night Combo",
      copy: "Large popcorn, drink and a classic snack.",
      price: 649,
      crop: "combo",
      tag: "Best value",
    },
    {
      name: "Raspberry Slush",
      copy: "Frozen raspberry refreshment served ice cold.",
      price: 474,
      crop: "slush",
      tag: "Vegan",
    },
  ];
  const [basket, setBasket] = useState<Record<string, number>>({});
  const basketTotal = products.reduce(
    (sum, item) => sum + item.price * (basket[item.name] || 0),
    0,
  );
  return (
    <section className="section">
      <span className="eyebrow">Express collection</span>
      <h1 className="page-title">Snacks sorted.</h1>
      <p className="page-intro">
        Order ahead with your tickets and collect from the express counter
        before the trailers.
      </p>
      <div className="food-grid">
        {products.map((item) => (
          <article className="food-card card" key={item.name}>
            <div className={`food-image food-image-${item.crop}`}>
              <img src={`/images/food-${item.crop}.png`} alt={item.name} />
            </div>
            <div className="food-body">
              <span className="food-tag">{item.tag}</span>
              <h2>{item.name}</h2>
              <p>{item.copy}</p>
              <div className="food-order">
                <strong>{money(item.price)}</strong>
                <div className="quantity" aria-label={`${item.name} quantity`}>
                  <button
                    aria-label={`Remove one ${item.name}`}
                    onClick={() =>
                      setBasket((current) => ({
                        ...current,
                        [item.name]: Math.max(0, (current[item.name] || 0) - 1),
                      }))
                    }
                  >
                    −
                  </button>
                  <span>{basket[item.name] || 0}</span>
                  <button
                    aria-label={`Add one ${item.name}`}
                    onClick={() =>
                      setBasket((current) => ({
                        ...current,
                        [item.name]: (current[item.name] || 0) + 1,
                      }))
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="basket-bar card">
        <div>
          <span>Your food order</span>
          <strong>
            {Object.values(basket).reduce((a, b) => a + b, 0)} items ·{" "}
            {money(basketTotal)}
          </strong>
        </div>
        <Link className="button" to="/movies" search={{}}>
          Add to a booking
        </Link>
      </div>
    </section>
  );
}
function Account() {
  return (
    <section className="section narrow">
      <span className="eyebrow">Your Cinego</span>
      <h1 className="page-title">Account</h1>
      <AccountPanel />
    </section>
  );
}
function AuthCallback() {
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
const rootRoute = createRootRoute({ component: Shell });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
const moviesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies",
  validateSearch: (s: Record<string, unknown>) => ({
    movie: typeof s.movie === "string" ? s.movie : "",
  }),
  component: Movies,
});
const premiumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/premium",
  component: Premium,
});
const bookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking",
  validateSearch: (s: Record<string, unknown>) => ({
    screening: String(s.screening || ""),
  }),
  component: Booking,
});
const membershipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/membership",
  component: Membership,
});
const confirmationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/confirmation",
  validateSearch: (s: Record<string, unknown>) => ({
    reference: String(s.reference || ""),
  }),
  component: Confirmation,
});
const foodRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/food",
  component: Food,
});
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: Account,
});
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});
const routeTree = rootRoute.addChildren([
  indexRoute,
  moviesRoute,
  premiumRoute,
  bookingRoute,
  membershipRoute,
  confirmationRoute,
  foodRoute,
  accountRoute,
  authCallbackRoute,
]);
export const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
