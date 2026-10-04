const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit").rateLimit;
const { getNowPlaying, getUpcoming } = require("../../services/tmdbService");
const store = require("../../services/store");
const { stripe, stripeConfigured } = require("../../services/stripeClient");
const { getAuthedUser } = require("../../services/auth");
const { supabaseConfigured } = require("../../services/supabaseClient");
const profiles = require("../../services/profileStore");
const { priceTickets } = require("../../services/pricing");
const {
  getOrCreateStripeCustomer,
  customerSessionSecret,
} = require("../../services/stripeCustomers");
const { confirmFromIntent } = require("../../services/bookingConfirmation");
const {
  addDays,
  bookableDate,
  hasStarted,
  ukNow,
  upcomingOnly,
} = require("../../services/showtimes");
const router = express.Router();
const bookingLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const age = z.object({
  rating: z.string(),
  ageBand: z.enum(["under-12", "12-14", "15-17", "18-plus"]),
  declared: z.literal(true),
  policyVersion: z.literal("uk-2026-1"),
  confirmedAt: z.string().optional(),
});
router.get("/screenings", async (req, res) => {
  // Past or far-future dates would also create screening rows, so they are
  // rejected rather than built.
  const date = bookableDate(req.query.date);
  if (!date)
    return res
      .status(400)
      .json({ error: "Choose a date between today and the next 60 days" });
  try {
    const movies = await getNowPlaying();
    const screenings = await store.buildScreenings(movies, {
      cinema: String(req.query.cinema || "edinburgh"),
      date,
      format: req.query.format ? String(req.query.format) : undefined,
    });
    res.json(upcomingOnly(screenings));
  } catch (e) {
    res.status(502).json({ error: "Could not load screenings" });
  }
});
// Advance/pre-booking screenings for films that are not yet in general
// release. Reuses the same buildScreenings() pricing/seat-map machinery as
// now-showing screenings (and the same Supabase upsert path), just sourced
// from TMDB's "upcoming" list instead of "now playing" — so a pre-booked
// screening id works through the existing seat/payment/confirm flow untouched.
router.get("/screenings/upcoming", async (req, res) => {
  try {
    const date = bookableDate(req.query.date || addDays(ukNow().date, 7));
    if (!date)
      return res
        .status(400)
        .json({ error: "Choose a date between today and the next 60 days" });
    const movies = await getUpcoming();
    const screenings = await store.buildScreenings(movies, {
      cinema: String(req.query.cinema || "edinburgh"),
      date,
      format: req.query.format ? String(req.query.format) : undefined,
    });
    res.json(upcomingOnly(screenings));
  } catch (e) {
    res.status(502).json({ error: "Could not load advance screenings" });
  }
});
router.get("/screenings/:id", async (req, res) => {
  const item = await store.getScreening(req.params.id);
  item
    ? res.json(item)
    : res.status(404).json({ error: "Screening not found" });
});
router.get("/screenings/:id/seats", async (req, res) => {
  const seats = await store.getSeats(req.params.id);
  seats
    ? res.json({ seats })
    : res.status(404).json({ error: "Screening not found" });
});
// Signed-in bookers with a date of birth on file are age-checked against
// that, not against whatever the booking form claims. Verified ID is
// required for 18-rated films when signed in.
async function accountAgeConfirmation(user, screeningId, claimed) {
  if (!user || !supabaseConfigured) return claimed;
  const profile = await profiles.getProfile(user.id);
  const screening = await store.getScreening(screeningId);
  if (screening?.rating === "18" && !profiles.isAgeVerified(profile))
    throw Object.assign(
      new Error(
        "18-rated films need a verified ID on your account. Verify your ID in Account → Verification, then try again.",
      ),
      { status: 403, code: "ID_VERIFICATION_REQUIRED" },
    );
  if (!profile.date_of_birth) return claimed;
  return {
    ...claimed,
    ageBand: profiles.ageBandFor(profiles.ageOn(profile.date_of_birth)),
    declared: true,
  };
}
router.post("/reservations", async (req, res) => {
  const parsed = z
    .object({
      screeningId: z.string().min(1),
      seatIds: z
        .array(z.string())
        .min(1)
        .max(12)
        .refine((ids) => new Set(ids).size === ids.length, "Duplicate seats"),
      ageConfirmation: age,
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid reservation request" });
  try {
    const screening = await store.getScreening(parsed.data.screeningId);
    if (!screening)
      return res.status(404).json({ error: "Screening not found" });
    if (hasStarted(screening))
      return res.status(409).json({
        error: "This screening has already started. Please choose a later showtime.",
        code: "SCREENING_STARTED",
      });
    const user = await getAuthedUser(req);
    const ageConfirmation = await accountAgeConfirmation(
      user,
      parsed.data.screeningId,
      parsed.data.ageConfirmation,
    );
    res.status(201).json(await store.reserve({ ...parsed.data, ageConfirmation }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

// Works out the price for a held reservation from server-side facts only:
// the seats held, the promo code, and (when signed in) the account's
// membership and student status.
async function priceReservation(req, reservationId, promoCode) {
  const user = await getAuthedUser(req);
  const promo = promoCode ? await store.getActivePromotion(promoCode) : null;
  if (promoCode && !promo)
    throw Object.assign(new Error("That promo code is invalid or has expired"), {
      status: 400,
    });
  let membership = null;
  let student = false;
  let freeTicketAvailable = false;
  if (user && supabaseConfigured) {
    const [current, profile] = await Promise.all([
      store.getMembership(user.id),
      profiles.getProfile(user.id),
    ]);
    student = profiles.isStudent(profile);
    if (current) {
      const plan = store.membershipPlans.find((p) => p.id === current.plan);
      membership = {
        id: current.id,
        renewsAt: current.renewsAt,
        plan: current.plan,
        discountPercent: plan?.discountPercent || 0,
      };
      freeTicketAvailable = await store.freeTicketAvailable(user.id, current);
    }
  }
  const quote = await store.getReservationQuote(reservationId);
  const pricing = priceTickets({
    ...quote,
    promo,
    membership,
    student,
    freeTicketAvailable,
  });
  return { user, membership, pricing };
}
const pricingSummary = (pricing) => ({
  amountPence: pricing.amountPence,
  fullPence: pricing.fullPence,
  discountPence: pricing.savingsPence,
  discountLabels: pricing.labels,
  free: pricing.free,
});
router.post("/reservations/:id/payment-intent", async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), promoCode: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid request" });
  try {
    const { user, pricing } = await priceReservation(
      req,
      req.params.id,
      parsed.data.promoCode,
    );
    // Below Stripe's minimum charge (e.g. a free member ticket) there's
    // nothing to pay: the client finishes with /confirm-free instead.
    if (pricing.free)
      return res
        .status(201)
        .json({ clientSecret: null, ...pricingSummary(pricing) });
    const customerId = user
      ? await getOrCreateStripeCustomer(user.id, user.email)
      : null;
    const intent = await store.createPaymentIntent(
      req.params.id,
      parsed.data.email,
      pricing,
      { customerId, userId: user?.id },
    );
    res.status(201).json({
      ...intent,
      ...pricingSummary(pricing),
      customerSessionClientSecret: await customerSessionSecret(customerId),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/reservations/:id/confirm-free", async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), promoCode: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success)
    return res.status(400).json({ error: "Invalid checkout" });
  try {
    const { user, membership, pricing } = await priceReservation(
      req,
      req.params.id,
      parsed.data.promoCode,
    );
    if (!user || !pricing.free)
      return res.status(402).json({ error: "This booking needs payment" });
    const booking = await store.confirm({
      reservationId: req.params.id,
      email: parsed.data.email,
      payment: {
        reference: `FREE-${req.params.id}`,
        brand: "member benefit",
        last4: "0000",
        amountPence: 0,
        status: "paid",
        createdAt: new Date().toISOString(),
      },
      discountPercent: pricing.discountPercent,
      discountPence: pricing.discountPence,
      promoCode: pricing.promoCode,
      userId: user.id,
    });
    if (pricing.usesFreeTicket)
      await store.recordFreeTicket(user.id, membership, booking.reference);
    res.status(201).json(booking);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/bookings/confirm", async (req, res) => {
  const parsed = z
    .object({
      reservationId: z.string().uuid(),
      email: z.string().email(),
      paymentIntentId: z.string().min(1),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid checkout" });
  if (!stripeConfigured)
    return res.status(500).json({ error: "Payments are not configured" });
  try {
    // Verify-on-return: the booking is confirmed only once Stripe itself
    // confirms the charge, never from anything the client claims.
    const intent = await stripe.paymentIntents.retrieve(
      parsed.data.paymentIntentId,
      { expand: ["latest_charge.payment_method_details"] },
    );
    if (intent.status !== "succeeded")
      return res.status(402).json({ error: "Payment not completed" });
    if (intent.metadata.reservationId !== parsed.data.reservationId)
      return res
        .status(400)
        .json({ error: "Payment does not match this reservation" });
    res.status(201).json(await confirmFromIntent(intent));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.get("/bookings/:reference", bookingLookupLimiter, async (req, res) => {
  const item = await store.getBooking(req.params.reference);
  item
    ? res.json(store.publicBooking(item))
    : res.status(404).json({ error: "Booking not found" });
});
router.get("/memberships/plans", (req, res) => {
  res.json(store.membershipPlans);
});
// Membership purchase requires a signed-in account (memberships persist
// against auth.users.id) — these three routes all gate on that first.
router.post("/memberships/payment-intent", async (req, res) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "Memberships require Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user)
    return res
      .status(401)
      .json({ error: "Sign in to start a membership purchase" });
  const parsed = z
    .object({
      plan: z.enum(["silver", "gold", "platinum", "student"]),
      promoCode: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid request" });
  try {
    const discount = parsed.data.promoCode
      ? await store.getActivePromotion(parsed.data.promoCode)
      : null;
    if (parsed.data.promoCode && !discount)
      return res
        .status(400)
        .json({ error: "That promo code is invalid or has expired" });
    res
      .status(201)
      .json(
        await store.createMembershipPaymentIntent(
          user.id,
          user.email,
          parsed.data.plan,
          discount,
        ),
      );
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/memberships/checkout", async (req, res) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "Memberships require Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user)
    return res
      .status(401)
      .json({ error: "Sign in to complete a membership purchase" });
  const parsed = z
    .object({
      plan: z.enum(["silver", "gold", "platinum", "student"]),
      paymentIntentId: z.string().min(1),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid membership checkout" });
  if (!stripeConfigured)
    return res.status(500).json({ error: "Payments are not configured" });
  try {
    const intent = await stripe.paymentIntents.retrieve(
      parsed.data.paymentIntentId,
      { expand: ["latest_charge.payment_method_details"] },
    );
    if (intent.status !== "succeeded")
      return res.status(402).json({ error: "Payment not completed" });
    if (intent.metadata.plan !== parsed.data.plan)
      return res
        .status(400)
        .json({ error: "Payment does not match this plan" });
    if (intent.metadata.userId !== user.id)
      return res
        .status(400)
        .json({ error: "Payment does not match this account" });
    const card = intent.latest_charge?.payment_method_details?.card;
    const payment = {
      reference: intent.id,
      brand: card?.brand || "unknown",
      last4: card?.last4 || "0000",
      amountPence: intent.amount_received,
      status: "paid",
      stripePaymentIntentId: intent.id,
    };
    res.status(201).json(
      await store.checkoutMembership({
        userId: user.id,
        plan: parsed.data.plan,
        payment,
        promoCode: intent.metadata.promoCode || null,
        discountPence: Number(intent.metadata.discountPence || 0),
      }),
    );
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.get("/memberships/mine", async (req, res) => {
  if (!supabaseConfigured) return res.json(null);
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  try {
    res.json(await store.getMembership(user.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/memberships/cancel", async (req, res) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "Memberships require Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  try {
    res.json(await store.cancelMembership(user.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/memberships/resume", async (req, res) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "Memberships require Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  try {
    res.json(await store.resumeMembership(user.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.get("/offers/active", async (req, res) => {
  res.json(await store.getActiveOffers());
});
router.get("/experiences", (req, res) =>
  res.json(Object.values(store.experiences)),
);
module.exports = router;
