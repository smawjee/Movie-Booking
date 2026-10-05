import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { loadWith, fakeSupabase } = require("../test/helpers");

const day = 86400000;
const promo = (overrides = {}) => ({
  code: "SAVE10",
  description: "10% off",
  discount_percent: 10,
  active: true,
  starts_at: new Date(Date.now() - day).toISOString(),
  ends_at: new Date(Date.now() + day).toISOString(),
  ...overrides,
});

function load(respond, supabaseConfigured = true) {
  const db = fakeSupabase(respond);
  const promotions = loadWith("services/promotions", {
    "services/supabaseClient": { supabase: db.client, supabaseConfigured },
  });
  return { promotions, db };
}

describe("getActivePromotion", () => {
  it("normalises the code and returns the discount", async () => {
    const { promotions, db } = load(() => ({ data: promo(), error: null }));
    expect(await promotions.getActivePromotion("  save10 ")).toEqual({
      code: "SAVE10",
      description: "10% off",
      discountPercent: 10,
    });
    expect(db.queries[0].filters).toContainEqual(["eq", "code", "SAVE10"]);
  });

  it.each([
    ["inactive", promo({ active: false })],
    [
      "not started",
      promo({ starts_at: new Date(Date.now() + day).toISOString() }),
    ],
    ["expired", promo({ ends_at: new Date(Date.now() - day).toISOString() })],
    ["unknown", null],
  ])("rejects a %s code", async (_, row) => {
    const { promotions } = load(() => ({ data: row, error: null }));
    expect(await promotions.getActivePromotion("SAVE10")).toBeNull();
  });

  it("rejects codes when the lookup errors", async () => {
    const { promotions } = load(() => ({ data: null, error: new Error("x") }));
    expect(await promotions.getActivePromotion("SAVE10")).toBeNull();
  });

  it("never queries for a blank code or without Supabase", async () => {
    const { promotions, db } = load(() => ({ data: promo(), error: null }));
    expect(await promotions.getActivePromotion("   ")).toBeNull();
    expect(await promotions.getActivePromotion(undefined)).toBeNull();
    expect(db.queries).toHaveLength(0);

    const offline = load(() => ({ data: promo(), error: null }), false);
    expect(await offline.promotions.getActivePromotion("SAVE10")).toBeNull();
  });
});

describe("getActiveOffers", () => {
  it("maps active offers and hides errors", async () => {
    const { promotions } = load(() => ({ data: [promo()], error: null }));
    expect(await promotions.getActiveOffers()).toEqual([
      { code: "SAVE10", description: "10% off", discountPercent: 10 },
    ]);
    const failing = load(() => ({ data: null, error: new Error("x") }));
    expect(await failing.promotions.getActiveOffers()).toEqual([]);
  });
});
