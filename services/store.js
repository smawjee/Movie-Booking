const { supabaseConfigured } = require("./supabaseClient");
const memoryStore = require("./cinemaStore");
const activeStore = supabaseConfigured
  ? require("./supabaseBookingStore")
  : memoryStore;

module.exports = {
  experiences: memoryStore.experiences,
  buildScreenings: (...args) => activeStore.buildScreenings(...args),
  getScreening: (...args) => activeStore.getScreening(...args),
  getSeats: (...args) => activeStore.getSeats(...args),
  reserve: (...args) => activeStore.reserve(...args),
  createPaymentIntent: (...args) => activeStore.createPaymentIntent(...args),
  confirm: (...args) => activeStore.confirm(...args),
  getBooking: (...args) => activeStore.getBooking(...args),
  updateDeliveryStatus: (...args) => activeStore.updateDeliveryStatus(...args),
  publicBooking: (...args) => activeStore.publicBooking(...args),
  // Memberships require a signed-in user (memberships.user_id is NOT NULL in
  // the schema); real auth isn't wired up yet, so this always stays in-memory
  // regardless of which store is active for bookings. The Stripe charge
  // itself is still real (test mode) — only the record of it is unpersisted,
  // exactly as before. It's lost on server restart, same as pre-Stripe.
  membershipPlans: memoryStore.membershipPlans,
  createMembershipPaymentIntent: (...args) =>
    memoryStore.createMembershipPaymentIntent(...args),
  checkoutMembership: (...args) => memoryStore.checkoutMembership(...args),
};
