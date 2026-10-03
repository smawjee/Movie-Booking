const express = require("express");
const rateLimit = require("express-rate-limit").rateLimit;
const { z } = require("zod");
const store = require("../../services/store");
const tickets = require("../../services/ticketService");
const router = express.Router();
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
