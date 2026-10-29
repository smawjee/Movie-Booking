const express = require("express");
const { z } = require("zod");
const store = require("../../services/store");
const tickets = require("../../services/ticketService");
const admin = require("../../services/adminStore");
const { getAuthedUser } = require("../../services/auth");
const { supabaseConfigured } = require("../../services/supabaseClient");
const router = express.Router();

// Every admin route needs a signed-in admin (see services/auth.js).
router.use("/admin", async (req, res, next) => {
  if (!supabaseConfigured)
    return res
      .status(503)
      .json({ error: "The admin area requires Supabase to be configured" });
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  if (!user.isAdmin) return res.status(403).json({ error: "Admins only" });
  req.user = user;
  next();
});
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    if (!e.status) console.error("[admin]", e.message);
    res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "Something went wrong" });
  }
};
const notFound = () =>
  Object.assign(new Error("Booking not found"), { status: 404 });

router.get(
  "/admin/overview",
  handle(() => admin.overview()),
);
router.get(
  "/admin/bookings",
  handle((req) => admin.listBookings(String(req.query.q || ""))),
);
// Re-sends a ticket to the email on the booking.
router.post(
  "/admin/bookings/:reference/resend",
  handle(async (req) => {
    const booking = await store.getBooking(req.params.reference);
    if (!booking) throw notFound();
    if (!booking.email)
      throw Object.assign(new Error("This booking has no email address"), {
        status: 400,
      });
    const result = await tickets.deliver(booking);
    await store.updateDeliveryStatus(booking.reference, result);
    return result;
  }),
);
// Door check: accepts the QR code's contents or a booking reference.
router.post(
  "/admin/verify",
  handle(async (req) => {
    const parsed = z
      .object({ code: z.string().trim().min(3).max(2000) })
      .safeParse(req.body);
    if (!parsed.success)
      throw Object.assign(new Error("Enter a ticket code or reference"), {
        status: 400,
      });
    const { code } = parsed.data;
    const reference = /^cg-/i.test(code)
      ? code.toUpperCase()
      : tickets.verifyToken(code)?.reference;
    if (!reference)
      return { valid: false, reason: "Invalid or forged ticket code" };
    const booking = await store.getBooking(reference);
    if (!booking) return { valid: false, reason: "Booking not found" };
    return {
      valid: true,
      reference: booking.reference,
      film: booking.screening.movieTitle,
      cinema: booking.screening.cinema,
      screen: booking.screening.screen,
      date: booking.screening.date,
      time: booking.screening.time,
      rating: booking.screening.rating,
      seats: booking.seats.map((s) => `${s.row}${s.number}`),
    };
  }),
);

module.exports = router;
