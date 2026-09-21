const crypto = require("crypto");
const { stripe, stripeConfigured } = require("./stripeClient");
const experiences = {
  standard: {
    id: "standard",
    name: "Standard 2D",
    description: "Crystal-clear projection and comfortable seating.",
    surchargePence: 0,
  },
  "3d": {
    id: "3d",
    name: "RealD 3D",
    description: "Immersive depth with lightweight 3D glasses.",
    surchargePence: 200,
  },
  imax: {
    id: "imax",
    name: "IMAX",
    description: "Floor-to-ceiling picture and precision sound.",
    surchargePence: 450,
  },
  dolby: {
    id: "dolby",
    name: "Dolby Cinema",
    description: "Dolby Vision, Atmos and luxury recliners.",
    surchargePence: 550,
  },
  "4dx": {
    id: "4dx",
    name: "4DX",
    description: "Motion seats with wind, water and environmental effects.",
    surchargePence: 650,
    warning:
      "Includes motion, water and flashing effects. Height restrictions apply; review medical and pregnancy guidance.",
  },
  screenx: {
    id: "screenx",
    name: "ScreenX",
    description: "A panoramic 270-degree cinema experience.",
    surchargePence: 500,
  },
};
const screenings = new Map(),
  reservations = new Map(),
  bookings = new Map();
const formats = Object.keys(experiences);
const uuid = () => crypto.randomUUID();
const hash = (s) =>
  Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
function buildScreenings(
  movies,
  {
    cinema = "edinburgh",
    date = new Date().toISOString().slice(0, 10),
    format,
  } = {},
) {
  const output = [];
  movies.slice(0, 20).forEach((movie, index) => {
    [11, 14, 17, 20].forEach((hour, slot) => {
      const formatId = formats[(index + slot) % formats.length];
      if (format && format !== formatId) return;
      const exp = experiences[formatId];
      const id = Buffer.from(
        [movie.id, cinema, date, hour, formatId].join("|"),
      ).toString("base64url");
      const item = {
        id,
        movieId: movie.id,
        movieTitle: movie.title,
        posterPath: movie.poster_path,
        cinema,
        date,
        time: `${String(hour).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`,
        screen: 1 + ((index + slot) % 10),
        experience: exp,
        pricePence: 899 + exp.surchargePence,
        rating: movie.rating || "NR",
        runtime: movie.runtime || 120,
        language: movie.language || "en",
      };
      screenings.set(id, item);
      output.push(item);
    });
  });
  return output;
}
function getScreening(id) {
  return screenings.get(id);
}
function getSeats(screeningId) {
  const screening = getScreening(screeningId);
  if (!screening) return null;
  expireReservations();
  const rows = screening.experience.id === "4dx" ? "ABCDEF" : "ABCDEFGH",
    count = screening.experience.id === "4dx" ? 8 : 12;
  const unavailable = new Set();
  for (const r of reservations.values())
    if (r.screeningId === screeningId && r.status === "held")
      r.seatIds.forEach((x) => unavailable.add(x));
  for (const b of bookings.values())
    if (b.screening.id === screeningId)
      b.seats.forEach((x) => unavailable.add(x.id));
  const randomSeed = hash(screeningId);
  const seats = [];
  for (const row of rows)
    for (let number = 1; number <= count; number++) {
      const id = `${row}${number}`;
      const tier =
        rows.indexOf(row) >= rows.length - 2 ? "premium" : "standard";
      seats.push({
        id,
        row,
        number,
        tier,
        pricePence: screening.pricePence + (tier === "premium" ? 250 : 0),
        available: !unavailable.has(id) && hash(`${id}${randomSeed}`) % 9 !== 0,
      });
    }
  return seats;
}
function ageAllowed(rating, ageBand, declared) {
  if (!declared) return false;
  if (rating === "18") return ageBand === "18-plus";
  if (rating === "15") return ["15-17", "18-plus"].includes(ageBand);
  return true;
}
function reserve({ screeningId, seatIds, ageConfirmation }) {
  const screening = getScreening(screeningId);
  if (!screening)
    throw Object.assign(new Error("Screening not found"), { status: 404 });
  if (
    !ageAllowed(
      screening.rating,
      ageConfirmation?.ageBand,
      ageConfirmation?.declared,
    )
  )
    throw Object.assign(
      new Error("Age confirmation does not meet this film rating"),
      { status: 403 },
    );
  const available = getSeats(screeningId);
  const chosen = seatIds.map((id) => available.find((s) => s.id === id));
  if (!chosen.length || chosen.some((x) => !x?.available))
    throw Object.assign(
      new Error("One or more seats are no longer available"),
      { status: 409 },
    );
  const reservation = {
    id: uuid(),
    screeningId,
    seatIds,
    ageConfirmation: {
      ...ageConfirmation,
      confirmedAt: new Date().toISOString(),
    },
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    status: "held",
  };
  reservations.set(reservation.id, reservation);
  return reservation;
}
function expireReservations() {
  for (const r of reservations.values())
    if (r.status === "held" && new Date(r.expiresAt) < new Date())
      r.status = "expired";
}
// Shared by confirm() and createPaymentIntent() so the charge amount and the
// final booking total can never drift apart — neither ever trusts a
// client-supplied amount.
function getReservationTotal(reservationId) {
  expireReservations();
  const reservation = reservations.get(reservationId);
  if (!reservation || reservation.status !== "held")
    throw Object.assign(new Error("Reservation has expired"), { status: 409 });
  const screening = getScreening(reservation.screeningId),
    allSeats = getSeats(reservation.screeningId),
    seats = reservation.seatIds.map(
      (id) =>
        allSeats.find((s) => s.id === id) || {
          id,
          row: id[0],
          number: Number(id.slice(1)),
          tier: "standard",
          pricePence: screening.pricePence,
        },
    );
  const totalPence = seats.reduce((s, x) => s + x.pricePence, 0);
  return { reservation, screening, seats, totalPence };
}

async function createPaymentIntent(reservationId, email, discount) {
  const { totalPence } = getReservationTotal(reservationId);
  if (!stripeConfigured)
    throw Object.assign(new Error("Payments are not configured"), {
      status: 500,
    });
  const amountPence = discount
    ? Math.round((totalPence * (100 - discount.discountPercent)) / 100)
    : totalPence;
  const intent = await stripe.paymentIntents.create({
    amount: amountPence,
    currency: "gbp",
    payment_method_types: ["card"],
    metadata: {
      reservationId,
      email,
      kind: "booking",
      promoCode: discount?.code || "",
      discountPercent: String(discount?.discountPercent || 0),
    },
  });
  return {
    clientSecret: intent.client_secret,
    amountPence,
    discountPence: totalPence - amountPence,
  };
}

function confirm({ reservationId, email, payment, discountPercent, promoCode }) {
  const { reservation, screening, seats, totalPence: fullTotalPence } =
    getReservationTotal(reservationId);
  const totalPence = Math.round(
    (fullTotalPence * (100 - (discountPercent || 0))) / 100,
  );
  const discountPence = fullTotalPence - totalPence;
  const reference = `CG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const safePayment = {
    reference: payment.reference,
    brand: payment.brand,
    last4: payment.last4,
    amountPence: totalPence,
    status: payment.status,
    createdAt: payment.createdAt || new Date().toISOString(),
    stripePaymentIntentId: payment.stripePaymentIntentId,
    promoCode: promoCode || undefined,
    discountPence: discountPence || 0,
  };
  const booking = {
    reference,
    screening,
    seats,
    email,
    totalPence,
    payment: safePayment,
    ageConfirmation: reservation.ageConfirmation,
    emailDelivery: { status: "queued" },
  };
  bookings.set(reference, booking);
  reservation.status = "confirmed";
  return booking;
}
// Plan ids match the lowercase primary keys already seeded into
// public.membership_plans by the initial schema migration.
const membershipPlans = [
  {
    id: "silver",
    name: "Silver",
    pricePence: 499,
    discountPercent: 5,
    perks: [
      "5% off every ticket",
      "Standard seat selection included",
      "Birthday reward voucher",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    pricePence: 899,
    discountPercent: 10,
    tag: "Most popular",
    style: "featured",
    perks: [
      "10% off tickets and food",
      "48-hour priority booking window",
      "1 free premium seat upgrade / month",
    ],
  },
  {
    id: "platinum",
    name: "Platinum",
    pricePence: 1499,
    discountPercent: 15,
    tag: "Best value",
    style: "premium",
    perks: [
      "15% off tickets and food",
      "72-hour priority booking window",
      "2 free premium upgrades / month",
      "Free large popcorn monthly",
    ],
  },
];
function publicBooking(booking) {
  const { email, payment, ...rest } = booking;
  return rest;
}
async function getBooking(reference) {
  return bookings.get(reference) || null;
}
async function updateDeliveryStatus(reference, result) {
  const booking = bookings.get(reference);
  if (booking) booking.emailDelivery = result;
}
module.exports = {
  experiences,
  buildScreenings,
  getScreening,
  getSeats,
  reserve,
  createPaymentIntent,
  confirm,
  bookings,
  getBooking,
  updateDeliveryStatus,
  publicBooking,
  membershipPlans,
};
