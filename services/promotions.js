const { supabase, supabaseConfigured } = require("./supabaseClient");

// Promo codes live only in Supabase (no in-memory fallback) — this is
// reference data, not something worth duplicating across two stores. When
// Supabase isn't configured, codes just aren't available yet, matching this
// app's existing "connect Supabase to unlock X" pattern for other features.
async function getActivePromotion(code) {
  if (!code || !supabaseConfigured) return null;
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("promotions")
    .select("code, description, discount_percent, starts_at, ends_at, active")
    .eq("code", normalized)
    .maybeSingle();
  if (error || !data || !data.active) return null;
  const now = new Date();
  if (new Date(data.starts_at) > now || new Date(data.ends_at) < now) return null;
  return {
    code: data.code,
    description: data.description,
    discountPercent: data.discount_percent,
  };
}

async function getActiveOffers() {
  if (!supabaseConfigured) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("code, description, discount_percent, starts_at, ends_at")
    .eq("active", true)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);
  if (error) return [];
  return data.map((row) => ({
    code: row.code,
    description: row.description,
    discountPercent: row.discount_percent,
  }));
}

module.exports = { getActivePromotion, getActiveOffers };
