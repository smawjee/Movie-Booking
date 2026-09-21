const express = require("express");
const rateLimit = require("express-rate-limit").rateLimit;
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
async function send(req, res) {
  const booking = await store.getBooking(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  try {
    await store.updateDeliveryStatus(req.params.reference, { status: "queued" });
    const result = await tickets.deliver(booking);
    await store.updateDeliveryStatus(req.params.reference, result);
    res.json(result);
  } catch (error) {
    await store.updateDeliveryStatus(req.params.reference, { status: "failed" });
    console.error("[ticket delivery]", error.message);
    res
      .status(502)
      .json({ error: "Ticket email failed; your booking is still confirmed" });
  }
}
router.post("/tickets/:reference/email", limiter, send);
router.post("/tickets/:reference/resend", limiter, send);
router.get("/tickets/:reference/data", readLimiter, async (req, res) => {
  const booking = await store.getBooking(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json(await tickets.ticketData(booking));
});
router.get("/tickets/:reference/download", readLimiter, async (req, res) => {
  const booking = await store.getBooking(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const document = await tickets.pdf(booking);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${booking.reference}.pdf"`,
  );
  res.type("application/pdf").send(document);
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
