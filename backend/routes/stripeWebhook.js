const express = require("express");
const { stripe, stripeConfigured } = require("../../services/stripeClient");
const { confirmFromIntent } = require("../../services/bookingConfirmation");
const router = express.Router();

// Server-side safety net for /api/bookings/confirm: if the customer pays but
// closes the tab (or loses signal) before the browser calls confirm, Stripe
// still tells us here and the booking is confirmed anyway. Signature
// verification needs the exact raw bytes Stripe signed, so this router is
// mounted in backend/index.js *before* express.json() and parses its own body.
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeConfigured || !secret)
      return res.status(503).json({ error: "Webhooks are not configured" });
    const signature = req.headers["stripe-signature"];
    if (!signature)
      return res.status(400).json({ error: "Missing Stripe signature" });
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "");

    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (e) {
      return res.status(400).json({ error: "Invalid Stripe signature" });
    }

    if (event.type !== "payment_intent.succeeded")
      return res.json({ received: true, ignored: event.type });
    // Membership intents share this Stripe account; only bookings are
    // confirmed here.
    if (event.data.object.metadata?.kind !== "booking")
      return res.json({ received: true, ignored: "not-a-booking" });

    try {
      // Re-fetch rather than trusting the event snapshot, so the charge
      // details (card brand/last4) are expanded and the status is current.
      const intent = await stripe.paymentIntents.retrieve(
        event.data.object.id,
        { expand: ["latest_charge.payment_method_details"] },
      );
      if (intent.status !== "succeeded")
        return res.json({ received: true, ignored: intent.status });
      const booking = await confirmFromIntent(intent);
      res.json({ received: true, reference: booking?.reference });
    } catch (e) {
      if (e.status === 409) {
        // The seat hold lapsed before payment landed. Retrying won't help, so
        // acknowledge the event (stops Stripe retrying) and log it loudly:
        // this customer was charged without a booking and needs a refund.
        console.error(
          `[stripe webhook] ${event.data.object.id} paid but reservation ` +
            `${event.data.object.metadata?.reservationId} had expired`,
        );
        return res.json({ received: true, error: "reservation-expired" });
      }
      // Anything else (DB down, Stripe API blip) gets a 500 so Stripe retries.
      console.error("[stripe webhook]", e.message);
      res.status(500).json({ error: "Could not confirm booking" });
    }
  },
);

module.exports = router;
