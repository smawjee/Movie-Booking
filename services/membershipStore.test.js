import { createRequire } from "module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { loadWith, fakeSupabase } = require("../test/helpers");

let stripe, db, respond, memberships;
function load({ stripeConfigured = true } = {}) {
  db = fakeSupabase((query) => respond(query));
  memberships = loadWith("services/membershipStore", {
    "services/stripeClient": { stripe, stripeConfigured },
    "services/supabaseClient": {
      supabase: db.client,
      supabaseConfigured: true,
    },
  });
}
const writes = (table, op) =>
  db.queries.filter((q) => q.table === table && q.op === op);

beforeEach(() => {
  stripe = {
    customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
    customerSessions: {
      create: vi.fn(async () => ({ client_secret: "cuss_secret" })),
    },
    paymentIntents: {
      create: vi.fn(async (params) => ({
        client_secret: "pi_secret",
        ...params,
      })),
    },
  };
  respond = () => ({ data: null, error: null });
  load();
});

describe("membership payment intents", () => {
  it("charges the plan price and reuses a saved Stripe customer", async () => {
    respond = (q) =>
      q.table === "profiles" && q.op === "select"
        ? { data: { stripe_customer_id: "cus_saved" }, error: null }
        : { data: null, error: null };
    const result = await memberships.createPaymentIntent(
      "user-1",
      "fan@example.com",
      "gold",
    );
    expect(result).toEqual({
      clientSecret: "pi_secret",
      amountPence: 899,
      discountPence: 0,
      customerSessionClientSecret: "cuss_secret",
    });
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 899,
        currency: "gbp",
        customer: "cus_saved",
        metadata: expect.objectContaining({
          plan: "gold",
          userId: "user-1",
          kind: "membership",
        }),
      }),
    );
  });

  it("creates and saves a Stripe customer on first purchase", async () => {
    await memberships.createPaymentIntent(
      "user-1",
      "fan@example.com",
      "silver",
    );
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: "fan@example.com",
      metadata: { userId: "user-1" },
    });
    expect(writes("profiles", "upsert")[0].payload).toEqual({
      id: "user-1",
      stripe_customer_id: "cus_new",
    });
  });

  it("applies a promo discount and records it in metadata", async () => {
    const result = await memberships.createPaymentIntent(
      "user-1",
      "fan@example.com",
      "platinum",
      { code: "HALF", discountPercent: 50 },
    );
    // 1499 * 0.5 = 749.5, which rounds to 750.
    expect(result.amountPence).toBe(750);
    expect(result.discountPence).toBe(749);
    expect(stripe.paymentIntents.create.mock.calls[0][0].metadata).toEqual(
      expect.objectContaining({ promoCode: "HALF", discountPence: "749" }),
    );
  });

  it("still takes payment when the saved-card lookup fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    respond = (q) =>
      q.table === "profiles"
        ? { data: null, error: new Error("column does not exist") }
        : { data: null, error: null };
    const result = await memberships.createPaymentIntent(
      "user-1",
      "fan@example.com",
      "gold",
    );
    expect(result).not.toHaveProperty("customerSessionClientSecret");
    expect(stripe.paymentIntents.create.mock.calls[0][0]).not.toHaveProperty(
      "customer",
    );
  });

  it("rejects an unknown plan with 400", async () => {
    await expect(
      memberships.createPaymentIntent("user-1", "fan@example.com", "diamond"),
    ).rejects.toMatchObject({ status: 400 });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("fails clearly when Stripe is not configured", async () => {
    load({ stripeConfigured: false });
    await expect(
      memberships.createPaymentIntent("user-1", "fan@example.com", "gold"),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe("membership checkout", () => {
  const payment = {
    reference: "pi_1",
    brand: "visa",
    last4: "4242",
    amountPence: 899,
  };

  it("activates the plan, records the payment and retires older plans", async () => {
    respond = (q) =>
      q.table === "memberships" && q.op === "insert"
        ? {
            data: {
              id: "m-2",
              plan_id: "gold",
              status: "active",
              renews_at: "2026-10-26T00:00:00Z",
              created_at: "2026-09-26T00:00:00Z",
            },
            error: null,
          }
        : { data: null, error: null };
    const result = await memberships.checkoutMembership({
      userId: "user-1",
      plan: "gold",
      payment,
      promoCode: "TEN",
      discountPence: 90,
    });
    expect(result).toEqual({
      id: "m-2",
      plan: "gold",
      status: "active",
      renewsAt: "2026-10-26T00:00:00Z",
      createdAt: "2026-09-26T00:00:00Z",
    });

    const inserted = writes("memberships", "insert")[0].payload;
    expect(inserted).toMatchObject({ user_id: "user-1", plan_id: "gold" });
    const renewsIn = new Date(inserted.renews_at) - Date.now();
    expect(Math.round(renewsIn / 86400000)).toBe(30);

    expect(writes("membership_payments", "insert")[0].payload).toEqual({
      membership_id: "m-2",
      reference: "pi_1",
      brand: "visa",
      last_four: "4242",
      amount_pence: 899,
      promo_code: "TEN",
      discount_pence: 90,
    });

    const retire = writes("memberships", "update")[0];
    expect(retire.payload).toEqual({ status: "cancelled" });
    expect(retire.filters).toEqual([
      ["eq", "user_id", "user-1"],
      ["eq", "status", "active"],
      ["neq", "id", "m-2"],
    ]);
  });

  it("does not record a payment if the membership insert fails", async () => {
    respond = (q) =>
      q.table === "memberships" && q.op === "insert"
        ? { data: null, error: new Error("insert failed") }
        : { data: null, error: null };
    await expect(
      memberships.checkoutMembership({
        userId: "user-1",
        plan: "gold",
        payment,
      }),
    ).rejects.toThrow("insert failed");
    expect(writes("membership_payments", "insert")).toHaveLength(0);
  });
});

describe("reading and cancelling memberships", () => {
  it("returns null when the user has no active plan", async () => {
    expect(await memberships.getMembership("user-1")).toBeNull();
  });

  it("cancels the current plan for that user only", async () => {
    respond = (q) =>
      q.table === "memberships" && q.op === "select"
        ? {
            data: { id: "m-1", plan_id: "silver", status: "active" },
            error: null,
          }
        : { data: null, error: null };
    expect(await memberships.cancelMembership("user-1")).toEqual({
      cancelled: true,
    });
    expect(writes("memberships", "update")[0].filters).toEqual([
      ["eq", "id", "m-1"],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("returns 404 when there is nothing to cancel", async () => {
    await expect(memberships.cancelMembership("user-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(writes("memberships", "update")).toHaveLength(0);
  });
});
