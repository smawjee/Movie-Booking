const crypto = require("crypto");
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
  bookings = new Map(),
  memberships = [];
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
function confirm({ reservationId, email, payment }) {
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
  const reference = `CG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const safePayment = {
    reference: payment.reference,
    brand: payment.brand,
    last4: payment.last4,
    amountPence: totalPence,
    status: "simulated",
    createdAt: new Date().toISOString(),
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
function checkoutMembership({ plan, payment, email }) {
  const prices = { Silver: 499, Gold: 899, Platinum: 1499 };
  if (!prices[plan])
    throw Object.assign(new Error("Unknown membership plan"), { status: 400 });
  const item = {
    id: uuid(),
    plan,
    email: email || null,
    status: "active",
    pricePence: prices[plan],
    renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    payment: {
      reference: payment.reference,
      brand: payment.brand,
      last4: payment.last4,
      status: "simulated",
    },
  };
  memberships.push(item);
  return item;
}
module.exports = {
  experiences,
  buildScreenings,
  getScreening,
  getSeats,
  reserve,
  confirm,
  bookings,
  checkoutMembership,
};
