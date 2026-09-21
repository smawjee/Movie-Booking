const { supabase } = require("./supabaseClient");
const { stripe, stripeConfigured } = require("./stripeClient");
const { membershipPlans } = require("./cinemaStore");

// Memberships require a signed-in Supabase user (memberships.user_id is
// NOT NULL, and membership is now explicitly tied to an account rather than
// guest-checkout) — so this store is only ever used once Supabase is
// configured; routes gate on that before calling in here.
function findPlan(planId) {
  const found = membershipPlans.find((p) => p.id === planId);
  if (!found)
    throw Object.assign(new Error("Unknown membership plan"), {
      status: 400,
    });
  return found;
}

async function createPaymentIntent(userId, plan, discount) {
  const found = findPlan(plan);
  if (!stripeConfigured)
    throw Object.assign(new Error("Payments are not configured"), {
      status: 500,
    });
  const amountPence = discount
    ? Math.round((found.pricePence * (100 - discount.discountPercent)) / 100)
    : found.pricePence;
  const intent = await stripe.paymentIntents.create({
    amount: amountPence,
    currency: "gbp",
    payment_method_types: ["card"],
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
  };
}

async function checkoutMembership({ userId, plan, payment, promoCode, discountPence }) {
  findPlan(plan);
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .insert({
      user_id: userId,
      plan_id: plan,
      status: "active",
      renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select("id, plan_id, status, renews_at, created_at")
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

  return {
    id: membership.id,
    plan: membership.plan_id,
    status: membership.status,
    renewsAt: membership.renews_at,
    createdAt: membership.created_at,
  };
}

async function getMembership(userId) {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, plan_id, status, renews_at, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    plan: data.plan_id,
    status: data.status,
    renewsAt: data.renews_at,
    createdAt: data.created_at,
  };
}

module.exports = { createPaymentIntent, checkoutMembership, getMembership };
