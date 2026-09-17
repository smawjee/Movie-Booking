const express = require("express");
const rateLimit = require("express-rate-limit").rateLimit;
const store = require("../../services/cinemaStore");
const tickets = require("../../services/ticketService");
const router = express.Router();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
async function send(req, res) {
  const booking = store.bookings.get(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  try {
    booking.emailDelivery = { status: "queued" };
    const result = await tickets.deliver(booking);
    booking.emailDelivery = result;
    res.json(result);
  } catch (error) {
    booking.emailDelivery = { status: "failed" };
    console.error("[ticket delivery]", error.message);
    res
      .status(502)
      .json({ error: "Ticket email failed; your booking is still confirmed" });
  }
}
router.post("/tickets/:reference/email", limiter, send);
router.post("/tickets/:reference/resend", limiter, send);
router.get("/tickets/:reference/data", async (req, res) => {
  const booking = store.bookings.get(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json(await tickets.ticketData(booking));
});
router.get("/tickets/:reference/download", async (req, res) => {
  const booking = store.bookings.get(req.params.reference);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const document = await tickets.pdf(booking);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${booking.reference}.pdf"`,
  );
  res.type("application/pdf").send(document);
});
router.get("/tickets/verify/:token", (req, res) => {
  const payload = tickets.verifyToken(req.params.token);
  if (!payload)
    return res
      .status(400)
      .json({ valid: false, error: "Invalid or expired ticket" });
  const booking = store.bookings.get(payload.reference);
  res.json({ valid: Boolean(booking), reference: booking?.reference });
});
router.get("/ticket-previews/:id", (req, res) => {
  const html = tickets.getPreview(req.params.id);
  html ? res.type("html").send(html) : res.status(404).send("Preview expired");
});
module.exports = router;
