const { supabaseConfigured } = require("./supabaseClient");
const memoryStore = require("./cinemaStore");
const activeStore = supabaseConfigured
  ? require("./supabaseBookingStore")
  : memoryStore;
const membershipStore = require("./membershipStore");
const { getActivePromotion, getActiveOffers } = require("./promotions");

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
  getActivePromotion,
  getActiveOffers,
  // Memberships are tied to a signed-in Supabase user (memberships.user_id
  // is NOT NULL and there's no guest path any more) — real persistence,
  // always via Supabase regardless of which store backs bookings. Routes
  // gate these behind supabaseConfigured before calling in.
  membershipPlans: memoryStore.membershipPlans,
  createMembershipPaymentIntent: (...args) =>
    membershipStore.createPaymentIntent(...args),
  checkoutMembership: (...args) => membershipStore.checkoutMembership(...args),
  getMembership: (...args) => membershipStore.getMembership(...args),
  cancelMembership: (...args) => membershipStore.cancelMembership(...args),
};
