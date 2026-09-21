const Stripe = require("stripe");
const configured = Boolean(process.env.STRIPE_SECRET_KEY);
const client = configured ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
module.exports = { stripe: client, stripeConfigured: configured };
