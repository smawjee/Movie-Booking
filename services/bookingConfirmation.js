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
  const userId = intent.metadata.userId || null;
  const booking = await store.confirm({
    reservationId: intent.metadata.reservationId,
    email: intent.metadata.email,
    payment,
    discountPercent: Number(intent.metadata.discountPercent || 0),
    discountPence: Number(intent.metadata.discountPence || 0),
    promoCode: intent.metadata.promoCode || null,
    userId,
  });
  // A repeat from the second caller only re-marks the same month's ticket
  // as used, which is harmless.
  if (intent.metadata.usesFreeTicket && userId) {
    const membership = await store.getMembership(userId);
    if (membership)
      await store.recordFreeTicket(userId, membership, booking.reference);
  }
  return booking;
}

module.exports = { confirmFromIntent };
