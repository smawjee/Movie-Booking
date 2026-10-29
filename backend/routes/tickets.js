const express = require("express");
const rateLimit = require("express-rate-limit").rateLimit;
const { z } = require("zod");
const store = require("../../services/store");
const tickets = require("../../services/ticketService");
const { getAuthedUser } = require("../../services/auth");
const wallet = require("../../services/walletService");
const router = express.Router();
const NEW_BOOKING_WINDOW_MS = 60 * 60 * 1000;
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const readLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const deliveryFailureReasons = {
  EAUTH: "the email account login was rejected",
  ETIMEDOUT: "the mail server could not be reached",
  ESOCKET: "the mail server connection failed",
  ECONNECTION: "the mail server could not be reached",
  EENVELOPE: "the address was rejected",
};
const recipient = z.object({ to: z.string().email().max(254).optional() });
async function send(req, res) {
  const parsed = recipient.safeParse(req.body || {});
  if (!parsed.success)
    return res.status(400).json({ error: "Enter a valid email address" });
  const booking = await store.getBooking(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  // Right after booking (the confirmation page) a ticket can go to any
  // address, e.g. a friend's. After that only the signed-in owner can send it
  // somewhere new, so a leaked reference can't be used to spam people.
  const to = parsed.data.to;
  const sameAddress = (a, b) => (a || "").toLowerCase() === (b || "").toLowerCase();
  const justBooked =
    Date.now() - new Date(booking.createdAt).valueOf() < NEW_BOOKING_WINDOW_MS;
  if (to && !sameAddress(to, booking.email) && !justBooked) {
    const user = await getAuthedUser(req);
    const owner =
      user && (booking.userId === user.id || sameAddress(user.email, booking.email));
    if (!owner)
      return res.status(403).json({
        error: "Sign in to the account that made this booking to send it to another address",
      });
  }
  try {
    await store.updateDeliveryStatus(req.params.reference, { status: "queued" });
    const result = await tickets.deliver(booking, parsed.data.to);
    await store.updateDeliveryStatus(req.params.reference, result);
    res.json(result);
  } catch (error) {
    await store.updateDeliveryStatus(req.params.reference, { status: "failed" });
    console.error("[ticket delivery]", error.code, error.message);
    // Only the provider's error code goes to the browser, never the message,
    // so a failed send can be diagnosed without exposing server details.
    const reason = deliveryFailureReasons[error.code];
    res.status(502).json({
      error: `Ticket email failed${reason ? ` (${reason})` : ""}; your booking is still confirmed`,
      code: error.code || "UNKNOWN",
    });
  }
}
router.post("/tickets/:reference/email", limiter, send);
router.post("/tickets/:reference/resend", limiter, send);
router.get("/tickets/:reference/data", readLimiter, async (req, res) => {
  try {
    const booking = await store.getBooking(req.params.reference);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json(await tickets.ticketData(booking));
  } catch (error) {
    console.error("[ticket data]", error.message);
    res.status(500).json({ error: "Could not load the ticket QR code" });
  }
});
router.get("/tickets/:reference/download", readLimiter, async (req, res) => {
  try {
    const booking = await store.getBooking(req.params.reference);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const document = await tickets.pdf(booking);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cinego-${booking.reference}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.type("application/pdf").send(document);
  } catch (error) {
    console.error("[ticket pdf]", error.message);
    res.status(500).json({ error: "Could not generate the PDF ticket" });
  }
});
// Which "Add to wallet" buttons to show.
router.get("/wallets", (req, res) => res.json(wallet.configured()));
router.get("/tickets/:reference/apple-wallet", readLimiter, async (req, res) => {
  if (!wallet.configured().apple)
    return res.status(503).json({ error: "Apple Wallet is not set up yet" });
  try {
    const booking = await store.getBooking(req.params.reference);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cinego-${booking.reference}.pkpass"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.type("application/vnd.apple.pkpass").send(wallet.applePass(booking));
  } catch (error) {
    console.error("[apple wallet]", error.message);
    res.status(500).json({ error: "Could not create the Apple Wallet pass" });
  }
});
router.get("/tickets/:reference/google-wallet", readLimiter, async (req, res) => {
  if (!wallet.configured().google)
    return res.status(503).json({ error: "Google Wallet is not set up yet" });
  try {
    const booking = await store.getBooking(req.params.reference);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const origin =
      process.env.PUBLIC_SITE_URL ||
      `${req.get("x-forwarded-proto") || req.protocol}://${req.get("host")}`;
    res.json({ url: await wallet.googleSaveUrl(booking, origin) });
  } catch (error) {
    console.error("[google wallet]", error.message);
    res.status(502).json({ error: "Could not add the ticket to Google Wallet" });
  }
});
router.get("/tickets/verify/:token", async (req, res) => {
  const payload = tickets.verifyToken(req.params.token);
  if (!payload)
    return res
      .status(400)
      .json({ valid: false, error: "Invalid or expired ticket" });
  const booking = await store.getBooking(payload.reference);
  res.json({ valid: Boolean(booking), reference: booking?.reference });
});
router.get("/ticket-previews/:id", (req, res) => {
  const html = tickets.getPreview(req.params.id);
  html ? res.type("html").send(html) : res.status(404).send("Preview expired");
});
module.exports = router;
