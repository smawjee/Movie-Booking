const { supabase } = require("./supabaseClient");
const { stripe, stripeConfigured } = require("./stripeClient");
const { experiences } = require("./cinemaStore");

const formats = Object.keys(experiences);
const hash = (s) =>
  Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));

let auditoriumCachePromise = null;
async function auditoriumMap() {
  if (!auditoriumCachePromise) {
    auditoriumCachePromise = (async () => {
      const { data, error } = await supabase
        .from("auditoriums")
        .select("id, experience_id, screen_number, cinemas ( slug )");
      if (error) throw error;
      const map = new Map();
      for (const row of data)
        map.set(`${row.cinemas.slug}|${row.experience_id}`, {
          id: row.id,
          screenNumber: row.screen_number,
        });
      return map;
    })();
  }
  return auditoriumCachePromise;
}

function ageAllowed(rating, ageBand, declared) {
  if (!declared) return false;
  if (rating === "18") return ageBand === "18-plus";
  if (rating === "15") return ["15-17", "18-plus"].includes(ageBand);
  return true;
}

async function buildScreenings(
  movies,
  {
    cinema = "edinburgh",
    date = new Date().toISOString().slice(0, 10),
    format,
  } = {},
) {
  const auditoriums = await auditoriumMap();
  const slice = movies.slice(0, 20);
  if (!slice.length) return [];

  const movieRows = slice.map((m) => ({
    id: m.id,
    title: m.title,
    overview: m.overview || "",
    poster_path: m.poster_path || null,
    rating: m.rating || "NR",
    runtime: m.runtime || null,
    language: m.language || "en",
    genre_ids: m.genre_ids || [],
  }));
  const { error: movieError } = await supabase
    .from("movies")
    .upsert(movieRows, { onConflict: "id" });
  if (movieError) throw movieError;

  const candidates = [];
  const seenSlots = new Set();
  slice.forEach((movie, index) => {
    [11, 14, 17, 20].forEach((hour, slot) => {
      const formatId = formats[(index + slot) % formats.length];
      if (format && format !== formatId) return;
      const aud = auditoriums.get(`${cinema}|${formatId}`);
      if (!aud) return;
      const startsAt = `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
      const slotKey = `${aud.id}|${startsAt}`;
      // Each auditorium can only host one screening per showtime, so the
      // first movie assigned to a given auditorium+time slot wins.
      if (seenSlots.has(slotKey)) return;
      seenSlots.add(slotKey);
      candidates.push({
        movie,
        formatId,
        aud,
        startsAt,
        time: `${String(hour).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`,
      });
    });
  });
  if (!candidates.length) return [];

  const screeningRows = candidates.map((c) => ({
    movie_id: c.movie.id,
    auditorium_id: c.aud.id,
    starts_at: c.startsAt,
    base_price_pence: 899 + experiences[c.formatId].surchargePence,
    language: c.movie.language || "en",
  }));
  const { data: upserted, error: screeningError } = await supabase
    .from("screenings")
    .upsert(screeningRows, { onConflict: "auditorium_id,starts_at" })
    .select("id, auditorium_id, starts_at");
  if (screeningError) throw screeningError;
  const idByKey = new Map(
    upserted.map((r) => [
      `${r.auditorium_id}|${new Date(r.starts_at).getTime()}`,
      r.id,
    ]),
  );

  return candidates.map((c) => {
    const exp = experiences[c.formatId];
    return {
      id: idByKey.get(`${c.aud.id}|${new Date(c.startsAt).getTime()}`),
      movieId: c.movie.id,
      movieTitle: c.movie.title,
      posterPath: c.movie.poster_path,
      cinema,
      date,
      time: c.time,
      screen: c.aud.screenNumber,
      experience: exp,
      pricePence: 899 + exp.surchargePence,
      rating: c.movie.rating || "NR",
      runtime: c.movie.runtime || 120,
      language: c.movie.language || "en",
    };
  });
}

async function getScreening(id) {
  const { data, error } = await supabase
    .from("screenings")
    .select(
      `id, movie_id, starts_at, base_price_pence, language,
       movies ( title, poster_path, rating, runtime ),
       auditoriums ( screen_number, experience_id, cinemas ( slug ) )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const exp = experiences[data.auditoriums.experience_id];
  const dt = new Date(data.starts_at);
  return {
    id: data.id,
    movieId: data.movie_id,
    movieTitle: data.movies.title,
    posterPath: data.movies.poster_path,
    cinema: data.auditoriums.cinemas.slug,
    date: dt.toISOString().slice(0, 10),
    time: dt.toISOString().slice(11, 16),
    screen: data.auditoriums.screen_number,
    experience: exp,
    pricePence: data.base_price_pence,
    rating: data.movies.rating,
    runtime: data.movies.runtime,
    language: data.language,
  };
}

async function getSeats(screeningId) {
  const { data: screening, error: screeningError } = await supabase
    .from("screenings")
    .select("auditorium_id, base_price_pence")
    .eq("id", screeningId)
    .maybeSingle();
  if (screeningError || !screening) return null;

  const [{ data: seatRows, error: seatError }, { data: heldRows, error: heldError }] =
    await Promise.all([
      supabase
        .from("seats")
        .select("id, row_label, seat_number, tier")
        .eq("auditorium_id", screening.auditorium_id),
      supabase
        .from("seat_reservations")
        .select("seat_id")
        .eq("screening_id", screeningId)
        .in("status", ["held", "confirmed"]),
    ]);
  if (seatError) throw seatError;
  if (heldError) throw heldError;

  const unavailable = new Set((heldRows || []).map((r) => r.seat_id));
  const randomSeed = hash(screeningId);
  return [...seatRows]
    .sort(
      (a, b) =>
        a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number,
    )
    .map((s) => {
      const label = `${s.row_label}${s.seat_number}`;
      return {
        id: s.id,
        row: s.row_label,
        number: s.seat_number,
        tier: s.tier,
        pricePence: screening.base_price_pence + (s.tier === "premium" ? 250 : 0),
        available:
          !unavailable.has(s.id) && hash(`${label}${randomSeed}`) % 9 !== 0,
      };
    });
}

async function reserve({ screeningId, seatIds, ageConfirmation }) {
  const screening = await getScreening(screeningId);
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

  const { data: draft, error: draftError } = await supabase
    .from("booking_drafts")
    .insert({
      screening_id: screeningId,
      ticket_count: seatIds.length,
      created_by: "user",
    })
    .select("id")
    .single();
  if (draftError) throw draftError;

  const { error: ageError } = await supabase.from("age_confirmations").insert({
    draft_id: draft.id,
    rating: screening.rating,
    age_band: ageConfirmation.ageBand,
    declared: ageConfirmation.declared,
    policy_version: ageConfirmation.policyVersion,
  });
  if (ageError) throw ageError;

  const { data: holds, error: holdError } = await supabase.rpc("hold_seats", {
    p_draft_id: draft.id,
    p_screening_id: screeningId,
    p_seat_ids: seatIds,
  });
  if (holdError) {
    if (holdError.code === "23505" || /SEAT_CONFLICT/.test(holdError.message))
      throw Object.assign(
        new Error("One or more seats are no longer available"),
        { status: 409 },
      );
    throw holdError;
  }

  return {
    id: draft.id,
    screeningId,
    seatIds,
    ageConfirmation: {
      ...ageConfirmation,
      confirmedAt: new Date().toISOString(),
    },
    expiresAt: holds?.[0]?.expires_at ?? new Date(Date.now() + 600000).toISOString(),
    status: "held",
  };
}

function mapBookingRow(data) {
  const s = data.screenings;
  const dt = new Date(s.starts_at);
  const exp = experiences[s.auditoriums.experience_id];
  const payment = Array.isArray(data.payments) ? data.payments[0] : data.payments;
  const delivery = Array.isArray(data.ticket_deliveries)
    ? data.ticket_deliveries[0]
    : data.ticket_deliveries;
  return {
    reference: data.reference,
    screening: {
      id: s.id,
      movieTitle: s.movies.title,
      posterPath: s.movies.poster_path,
      cinema: s.auditoriums.cinemas.slug,
      date: dt.toISOString().slice(0, 10),
      time: dt.toISOString().slice(11, 16),
      screen: s.auditoriums.screen_number,
      experience: exp,
      pricePence: s.base_price_pence,
      rating: s.movies.rating,
      runtime: s.movies.runtime,
      language: s.language,
    },
    seats: data.booking_seats.map((bs) => ({
      row: bs.seats.row_label,
      number: bs.seats.seat_number,
      tier: bs.seats.tier,
      pricePence: bs.price_pence,
    })),
    email: data.guest_email,
    totalPence: data.total_pence,
    payment: payment
      ? {
          reference: payment.reference,
          brand: payment.brand,
          last4: payment.last_four,
          amountPence: payment.amount_pence,
          status: payment.status,
          createdAt: payment.created_at,
        }
      : null,
    emailDelivery: { status: delivery?.status || "queued" },
  };
}

const BOOKING_SELECT = `id, reference, guest_email, total_pence, status,
  screenings ( id, starts_at, base_price_pence, language,
    movies ( title, poster_path, rating, runtime ),
    auditoriums ( screen_number, experience_id, cinemas ( slug ) ) ),
  booking_seats ( price_pence, seats ( row_label, seat_number, tier ) ),
  payments ( reference, brand, last_four, amount_pence, status, created_at ),
  ticket_deliveries ( status, provider_reference )`;

async function fetchBooking(column, value) {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq(column, value)
    .maybeSingle();
  if (error || !data) return null;
  return mapBookingRow(data);
}

// Read-only mirror of the pricing logic inside the confirm_booking RPC, so a
// PaymentIntent can be created for the correct amount before that RPC runs.
// The RPC itself still recomputes the total in SQL at confirm time and never
// trusts anything passed in from the client.
async function getReservationTotal(reservationId) {
  const { data: rows, error } = await supabase
    .from("seat_reservations")
    .select("seat_id, seats ( tier ), screenings ( base_price_pence )")
    .eq("draft_id", reservationId)
    .eq("status", "held");
  if (error) throw error;
  if (!rows || !rows.length)
    throw Object.assign(new Error("Reservation has expired"), {
      status: 409,
    });
  const basePrice = rows[0].screenings.base_price_pence;
  const totalPence = rows.reduce(
    (sum, r) => sum + basePrice + (r.seats.tier === "premium" ? 250 : 0),
    0,
  );
  return { totalPence };
}

async function createPaymentIntent(reservationId, email, discount) {
  const { totalPence } = await getReservationTotal(reservationId);
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

async function confirm({ reservationId, email, payment, discountPercent, promoCode }) {
  const { data: bookingId, error } = await supabase.rpc("confirm_booking", {
    p_draft_id: reservationId,
    p_email: email,
    p_payment: payment,
    p_discount_percent: discountPercent || 0,
    p_promo_code: promoCode || null,
  });
  if (error) {
    if (/RESERVATION_EXPIRED/.test(error.message))
      throw Object.assign(new Error("Reservation has expired"), {
        status: 409,
      });
    throw error;
  }
  return fetchBooking("id", bookingId);
}

async function getBooking(reference) {
  return fetchBooking("reference", reference);
}

async function updateDeliveryStatus(reference, result) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return;
  await supabase
    .from("ticket_deliveries")
    .update({
      status: result.status,
      provider_reference: result.providerReference || null,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("booking_id", booking.id);
}

function publicBooking(booking) {
  const { email, payment, ...rest } = booking;
  return rest;
}

module.exports = {
  experiences,
  buildScreenings,
  getScreening,
  getSeats,
  reserve,
  createPaymentIntent,
  confirm,
  getBooking,
  updateDeliveryStatus,
  publicBooking,
};
