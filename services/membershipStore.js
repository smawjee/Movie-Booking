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

// Resolves this user's Stripe Customer, creating one on first use. Never
// throws — the profiles.stripe_customer_id column may not exist yet (it's a
// manually-applied migration), and a lookup/save failure here should never
// block a purchase, only skip the saved-card capability for this checkout.
async function getOrCreateStripeCustomer(userId, email) {
  try {
    const { data: profile, error: readError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (profile?.stripe_customer_id) return profile.stripe_customer_id;

    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    const { error: writeError } = await supabase
      .from("profiles")
      .upsert({ id: userId, stripe_customer_id: customer.id });
    if (writeError) throw writeError;
    return customer.id;
  } catch (e) {
    console.warn("getOrCreateStripeCustomer skipped:", e.message);
    return null;
  }
}

async function createPaymentIntent(userId, email, plan, discount) {
  const found = findPlan(plan);
  if (!stripeConfigured)
    throw Object.assign(new Error("Payments are not configured"), {
      status: 500,
    });
  const amountPence = discount
    ? Math.round((found.pricePence * (100 - discount.discountPercent)) / 100)
    : found.pricePence;

  const customerId = await getOrCreateStripeCustomer(userId, email);
  let customerSessionClientSecret;
  if (customerId) {
    try {
      const session = await stripe.customerSessions.create({
        customer: customerId,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_save: "enabled",
              payment_method_redisplay: "enabled",
              payment_method_remove: "enabled",
            },
          },
        },
      });
      customerSessionClientSecret = session.client_secret;
    } catch (e) {
      console.warn("customerSessions.create skipped:", e.message);
    }
  }

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

  // A user should only ever have one active membership — retiring any other
  // active row here is what lets "switch plan" work as a plain repurchase.
  const { error: retireError } = await supabase
    .from("memberships")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("id", membership.id);
  if (retireError) throw retireError;

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

async function cancelMembership(userId) {
  const current = await getMembership(userId);
  if (!current)
    throw Object.assign(new Error("No active membership to cancel"), {
      status: 404,
    });
  const { error } = await supabase
    .from("memberships")
    .update({ status: "cancelled" })
    .eq("id", current.id)
    .eq("user_id", userId);
  if (error) throw error;
  return { cancelled: true };
}

module.exports = {
  createPaymentIntent,
  checkoutMembership,
  getMembership,
  cancelMembership,
};
