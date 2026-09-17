const express = require("express");
const { z } = require("zod");
const { getNowPlaying } = require("../../services/tmdbService");
const store = require("../../services/cinemaStore");
const router = express.Router();
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
      store.buildScreenings(movies, {
        cinema: String(req.query.cinema || "edinburgh"),
        date: String(req.query.date || new Date().toISOString().slice(0, 10)),
        format: req.query.format ? String(req.query.format) : undefined,
      }),
    );
  } catch (e) {
    res.status(502).json({ error: "Could not load screenings" });
  }
});
router.get("/screenings/:id", (req, res) => {
  const item = store.getScreening(req.params.id);
  item
    ? res.json(item)
    : res.status(404).json({ error: "Screening not found" });
});
router.get("/screenings/:id/seats", (req, res) => {
  const seats = store.getSeats(req.params.id);
  seats
    ? res.json({ seats })
    : res.status(404).json({ error: "Screening not found" });
});
router.post("/reservations", (req, res) => {
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
    res.status(201).json(store.reserve(parsed.data));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.post("/bookings/confirm", (req, res) => {
  const parsed = z
    .object({
      reservationId: z.string().uuid(),
      email: z.string().email(),
      payment: z.object({
        reference: z.string(),
        brand: z.enum(["visa", "mastercard", "amex", "unknown"]),
        last4: z.string().length(4),
        amountPence: z.number(),
        status: z.literal("simulated"),
        createdAt: z.string(),
      }),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid checkout" });
  try {
    res.status(201).json(store.confirm(parsed.data));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.get("/bookings/:reference", (req, res) => {
  const item = store.bookings.get(req.params.reference);
  item ? res.json(item) : res.status(404).json({ error: "Booking not found" });
});
router.post("/memberships/checkout", (req, res) => {
  const parsed = z
    .object({
      plan: z.enum(["Silver", "Gold", "Platinum"]),
      email: z.string().email().optional(),
      payment: z.object({
        reference: z.string(),
        brand: z.string(),
        last4: z.string().length(4),
      }),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid membership checkout" });
  try {
    res.status(201).json(store.checkoutMembership(parsed.data));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
router.get("/experiences", (req, res) =>
  res.json(Object.values(store.experiences)),
);
module.exports = router;
