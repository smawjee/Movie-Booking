const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit").rateLimit;
const store = require("../../services/store");
const profiles = require("../../services/profileStore");
const cards = require("../../services/stripeCustomers");
const { sendMessage } = require("../../services/ticketService");
const { getAuthedUser } = require("../../services/auth");
const { supabaseConfigured } = require("../../services/supabaseClient");
const { stripeConfigured } = require("../../services/stripeClient");
const router = express.Router();

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const documentMeta = z.object({
  name: z.string().max(200),
  type: z.string().max(100),
  size: z.number().int().nonnegative(),
});

// Every route here needs a signed-in user with Supabase configured.
router.use(["/account", "/verification"], async (req, res, next) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "Accounts require Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  req.user = user;
  next();
});
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    if (!e.status) console.error("[account]", e.message);
    res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "Something went wrong" });
  }
};
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

router.get(
  "/account/profile",
  handle(async (req) =>
    profiles.publicProfile(await profiles.getProfile(req.user.id), req.user),
  ),
);
router.put(
  "/account/profile",
  handle(async (req) => {
    const parsed = z
      .object({
        fullName: z.string().trim().min(1).max(120).optional(),
        dateOfBirth: isoDate.optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw invalid("Check your name and date of birth");
    return profiles.publicProfile(
      await profiles.updateProfile(req.user.id, parsed.data),
      req.user,
    );
  }),
);
router.get(
  "/account/bookings",
  handle(async (req) =>
    (await store.listBookingsForUser(req.user.id, req.user.email)).map(
      (booking) => ({
        ...store.publicBooking(booking),
        createdAt: booking.createdAt,
      }),
    ),
  ),
);

// Saved cards (Stripe customer payment methods).
const requireStripe = () => {
  if (!stripeConfigured)
    throw Object.assign(new Error("Payments are not configured"), {
      status: 503,
    });
};
const paymentMethodId = z.string().regex(/^pm_[A-Za-z0-9]+$/);
router.get(
  "/account/payment-methods",
  handle(async (req) => {
    requireStripe();
    return cards.listCards(req.user.id);
  }),
);
router.post(
  "/account/payment-methods/setup-intent",
  handle(async (req) => {
    requireStripe();
    return cards.createSetupIntent(req.user.id, req.user.email);
  }),
);
router.delete(
  "/account/payment-methods/:id",
  handle(async (req) => {
    requireStripe();
    if (!paymentMethodId.safeParse(req.params.id).success)
      throw invalid("Invalid card");
    return cards.removeCard(req.user.id, req.params.id);
  }),
);
router.post(
  "/account/payment-methods/:id/default",
  handle(async (req) => {
    requireStripe();
    if (!paymentMethodId.safeParse(req.params.id).success)
      throw invalid("Invalid card");
    return cards.setDefaultCard(req.user.id, req.params.id);
  }),
);

// Simulated verification (see services/profileStore.js).
router.post(
  "/verification/identity",
  verificationLimiter,
  handle(async (req) => {
    const parsed = z
      .object({
        documentType: z.enum(["passport", "driving_licence", "national_id"]),
        dateOfBirth: isoDate,
        document: documentMeta,
      })
      .safeParse(req.body);
    if (!parsed.success) throw invalid("Complete every field to verify your ID");
    return profiles.submitIdentity(req.user.id, parsed.data);
  }),
);
router.post(
  "/verification/student/start",
  verificationLimiter,
  handle(async (req) => {
    const parsed = z
      .object({
        studentEmail: z.string().email().max(254),
        institution: z.string().trim().min(2).max(120),
      })
      .safeParse(req.body);
    if (!parsed.success)
      throw invalid("Enter your institution and student email address");
    return profiles.startStudent(req.user.id, parsed.data, sendMessage);
  }),
);
router.post(
  "/verification/student/confirm",
  verificationLimiter,
  handle(async (req) => {
    const parsed = z
      .object({ code: z.string().regex(/^\d{6}$/), document: documentMeta })
      .safeParse(req.body);
    if (!parsed.success)
      throw invalid("Enter the 6-digit code and add your student ID");
    return profiles.confirmStudent(req.user.id, parsed.data);
  }),
);

module.exports = router;
