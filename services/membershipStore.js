const { supabase } = require("./supabaseClient");
const { stripe, stripeConfigured } = require("./stripeClient");
const { membershipPlans } = require("./cinemaStore");
const {
  getOrCreateStripeCustomer,
  customerSessionSecret,
} = require("./stripeCustomers");
const profiles = require("./profileStore");

// Memberships require a signed-in Supabase user (memberships.user_id is
// NOT NULL, and membership is tied to an account rather than guest
// checkout), so this store is only used once Supabase is configured; routes
// check for that before calling in here.
const httpError = (message, status) =>
  Object.assign(new Error(message), { status });

function findPlan(planId) {
  const found = membershipPlans.find((p) => p.id === planId);
  if (!found) throw httpError("Unknown membership plan", 400);
  return found;
}

async function assertEligible(userId, plan) {
  if (plan !== "student") return;
  const profile = await profiles.getProfile(userId);
  if (!profiles.isStudent(profile))
    throw httpError(
      "The Student plan needs a verified student account. Verify your student status in your account first.",
      403,
    );
}

async function createPaymentIntent(userId, email, plan, discount) {
  const found = findPlan(plan);
  await assertEligible(userId, plan);
  if (!stripeConfigured) throw httpError("Payments are not configured", 500);
  const amountPence = discount
    ? Math.round((found.pricePence * (100 - discount.discountPercent)) / 100)
    : found.pricePence;

  const customerId = await getOrCreateStripeCustomer(userId, email);
  const customerSessionClientSecret = await customerSessionSecret(customerId);
  const intent = await stripe.paymentIntents.create({
    amount: amountPence,
    currency: "gbp",
    payment_method_types: ["card"],
    ...(customerId && { customer: customerId }),
    metadata: {
      plan,
      userId,
      kind: "membership",
      promoCode: discount?.code || "",
      discountPence: String(found.pricePence - amountPence),
    },
  });
  return {
    clientSecret: intent.client_secret,
    amountPence,
    discountPence: found.pricePence - amountPence,
    ...(customerSessionClientSecret && { customerSessionClientSecret }),
  };
}

const mapMembership = (row) =>
  row && {
    id: row.id,
    plan: row.plan_id,
    status: row.status,
    renewsAt: row.renews_at,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at || null,
  };

async function checkoutMembership({ userId, plan, payment, promoCode, discountPence }) {
  findPlan(plan);
  await assertEligible(userId, plan);
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .insert({
      user_id: userId,
      plan_id: plan,
      status: "active",
      renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select("id, plan_id, status, renews_at, created_at, cancelled_at")
    .single();
  if (membershipError) throw membershipError;

  const { error: paymentError } = await supabase
    .from("membership_payments")
    .insert({
      membership_id: membership.id,
      reference: payment.reference,
      brand: payment.brand,
      last_four: payment.last4,
      amount_pence: payment.amountPence,
      promo_code: promoCode || null,
      discount_pence: discountPence || 0,
    });
  if (paymentError) throw paymentError;

  // A user should only ever have one current membership: retiring the others
  // here is what lets "switch plan" work as a plain repurchase.
  const { error: retireError } = await supabase
    .from("memberships")
    .update({ status: "cancelled", renews_at: new Date().toISOString() })
    .eq("user_id", userId)
    .neq("id", membership.id)
    .or(`status.eq.active,renews_at.gt.${new Date().toISOString()}`);
  if (retireError) throw retireError;

  return mapMembership(membership);
}

// The current membership: active, or cancelled but still inside the period
// already paid for (benefits last until renews_at).
async function getMembership(userId) {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, plan_id, status, renews_at, created_at, cancelled_at")
    .eq("user_id", userId)
    .or(`status.eq.active,renews_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapMembership(data) || null;
}

async function cancelMembership(userId) {
  const current = await getMembership(userId);
  if (!current || current.status !== "active")
    throw httpError("No active membership to cancel", 404);
  const { error } = await supabase
    .from("memberships")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", current.id)
    .eq("user_id", userId);
  if (error) throw error;
  return { cancelled: true, accessUntil: current.renewsAt };
}

async function resumeMembership(userId) {
  const current = await getMembership(userId);
  if (!current || current.status !== "cancelled")
    throw httpError("There is no cancelled membership to resume", 404);
  const { data, error } = await supabase
    .from("memberships")
    .update({ status: "active", cancelled_at: null })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("id, plan_id, status, renews_at, created_at, cancelled_at")
    .single();
  if (error) throw error;
  return mapMembership(data);
}

const periodStart = (membership) => {
  // Benefits reset on each monthly renewal: the period starts 30 days
  // before renews_at.
  const start = new Date(new Date(membership.renewsAt).getTime() - 30 * 86400000);
  return start.toISOString().slice(0, 10);
};

async function freeTicketAvailable(userId, membership) {
  if (membership?.plan !== "student") return false;
  const { data, error } = await supabase
    .from("membership_benefit_usage")
    .select("id")
    .eq("membership_id", membership.id)
    .eq("benefit", "free-ticket")
    .eq("period_start", periodStart(membership))
    .maybeSingle();
  if (error) throw error;
  return !data;
}

async function recordFreeTicket(userId, membership, bookingReference) {
  const { error } = await supabase.from("membership_benefit_usage").insert({
    user_id: userId,
    membership_id: membership.id,
    benefit: "free-ticket",
    period_start: periodStart(membership),
    booking_reference: bookingReference,
  });
  if (error) console.warn("recordFreeTicket failed:", error.message);
}

module.exports = {
  createPaymentIntent,
  checkoutMembership,
  getMembership,
  cancelMembership,
  resumeMembership,
  freeTicketAvailable,
  recordFreeTicket,
};
