const { supabase, supabaseConfigured } = require("./supabaseClient");
const { stripe, stripeConfigured } = require("./stripeClient");

const httpError = (message, status) =>
  Object.assign(new Error(message), { status });

// Resolves this user's Stripe Customer, creating one on first use. Never
// throws: a lookup or save failure should only skip saved cards for this
// checkout, never block the purchase.
async function getOrCreateStripeCustomer(userId, email) {
  if (!supabaseConfigured || !stripeConfigured || !userId) return null;
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

async function existingCustomerId(userId) {
  if (!supabaseConfigured) return null;
  const { data } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.stripe_customer_id || null;
}

// Lets the Payment Element show, save and remove this customer's cards.
async function customerSessionSecret(customerId) {
  if (!customerId) return undefined;
  try {
    const session = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_save: "enabled",
            payment_method_save_usage: "off_session",
            payment_method_redisplay: "enabled",
            payment_method_remove: "enabled",
          },
        },
      },
    });
    return session.client_secret;
  } catch (e) {
    console.warn("customerSessions.create skipped:", e.message);
    return undefined;
  }
}

async function listCards(userId) {
  const customerId = await existingCustomerId(userId);
  if (!customerId) return { cards: [], defaultId: null };
  const [methods, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 }),
    stripe.customers.retrieve(customerId),
  ]);
  const defaultId =
    customer.invoice_settings?.default_payment_method || methods.data[0]?.id || null;
  return {
    defaultId,
    cards: methods.data.map((m) => ({
      id: m.id,
      brand: m.card?.brand || "card",
      last4: m.card?.last4 || "0000",
      expMonth: m.card?.exp_month,
      expYear: m.card?.exp_year,
      isDefault: m.id === defaultId,
    })),
  };
}

// Every card operation first proves the card belongs to this user's customer.
async function ownedCard(userId, paymentMethodId) {
  const customerId = await existingCustomerId(userId);
  if (!customerId) throw httpError("No saved cards on this account", 404);
  const method = await stripe.paymentMethods
    .retrieve(paymentMethodId)
    .catch(() => null);
  if (!method || method.customer !== customerId)
    throw httpError("Card not found", 404);
  return { customerId, method };
}

async function removeCard(userId, paymentMethodId) {
  await ownedCard(userId, paymentMethodId);
  await stripe.paymentMethods.detach(paymentMethodId);
  return { removed: true };
}

async function setDefaultCard(userId, paymentMethodId) {
  const { customerId } = await ownedCard(userId, paymentMethodId);
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return { defaultId: paymentMethodId };
}

async function createSetupIntent(userId, email) {
  const customerId = await getOrCreateStripeCustomer(userId, email);
  if (!customerId) throw httpError("Saved cards are unavailable right now", 503);
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: { userId },
  });
  return { clientSecret: intent.client_secret };
}

module.exports = {
  getOrCreateStripeCustomer,
  customerSessionSecret,
  listCards,
  removeCard,
  setDefaultCard,
  createSetupIntent,
};
