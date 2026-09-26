const store = require("./store");

// Single path from a succeeded Stripe PaymentIntent to a confirmed booking,
// shared by the browser's verify-on-return call (/api/bookings/confirm) and
// the payment_intent.succeeded webhook. Everything is read from the intent
// itself (metadata was set server-side when the intent was created), and the
// store's confirm() is idempotent per PaymentIntent, so whichever of the two
// arrives second gets the same booking back instead of an error.
async function confirmFromIntent(intent) {
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
  return store.confirm({
    reservationId: intent.metadata.reservationId,
    email: intent.metadata.email,
    payment,
    discountPercent: Number(intent.metadata.discountPercent || 0),
    promoCode: intent.metadata.promoCode || null,
  });
}

module.exports = { confirmFromIntent };
