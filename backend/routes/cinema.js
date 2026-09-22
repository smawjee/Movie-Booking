const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit").rateLimit;
const { getNowPlaying, getUpcoming } = require("../../services/tmdbService");
const store = require("../../services/store");
const { stripe, stripeConfigured } = require("../../services/stripeClient");
const { getAuthedUser } = require("../../services/auth");
const { supabaseConfigured } = require("../../services/supabaseClient");
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
  try {
    const movies = await getNowPlaying();
    res.json(
      await store.buildScreenings(movies, {
        cinema: String(req.query.cinema || "edinburgh"),
        date: String(req.query.date || new Date().toISOString().slice(0, 10)),
        format: req.query.format ? String(req.query.format) : undefined,
      }),
    );
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
    const movies = await getUpcoming();
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    res.json(
      await store.buildScreenings(movies, {
        cinema: String(req.query.cinema || "edinburgh"),
        date: String(
          req.query.date || defaultDate.toISOString().slice(0, 10),
        ),
        format: req.query.format ? String(req.query.format) : undefined,
      }),
    );
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
router.post("/reservations", async (req, res) => {
  const parsed = z
    .object({
      screeningId: z.string().min(1),
      seatIds: z.array(z.string()).min(1).max(12),
      ageConfirmation: age,
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid reservation request" });
  try {
    res.status(201).json(await store.reserve(parsed.data));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/reservations/:id/payment-intent", async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), promoCode: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid request" });
  try {
    if (parsed.data.promoCode) {
      const discount = await store.getActivePromotion(parsed.data.promoCode);
      if (!discount)
        return res
          .status(400)
          .json({ error: "That promo code is invalid or has expired" });
      return res
        .status(201)
        .json(
          await store.createPaymentIntent(
            req.params.id,
            parsed.data.email,
            discount,
          ),
        );
    }
    res
      .status(201)
      .json(
        await store.createPaymentIntent(req.params.id, parsed.data.email),
      );
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
    const card = intent.latest_charge?.payment_method_details?.card;
    const payment = {
      reference: intent.id,
      brand: card?.brand || "unknown",
      last4: card?.last4 || "0000",
      amountPence: intent.amount_received,
      status: "paid",
      createdAt: new Date(intent.created * 1000).toISOString(),
      stripePaymentIntentId: intent.id,
    };
    res.status(201).json(
      await store.confirm({
        reservationId: parsed.data.reservationId,
        email: parsed.data.email,
        payment,
        discountPercent: Number(intent.metadata.discountPercent || 0),
        promoCode: intent.metadata.promoCode || null,
      }),
    );
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
      plan: z.enum(["silver", "gold", "platinum"]),
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
      plan: z.enum(["silver", "gold", "platinum"]),
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
router.get("/offers/active", async (req, res) => {
  res.json(await store.getActiveOffers());
});
router.get("/experiences", (req, res) =>
  res.json(Object.values(store.experiences)),
);
module.exports = router;
