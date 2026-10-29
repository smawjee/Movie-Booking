const { supabase } = require("./supabaseClient");

// Admins have app_metadata.role = "admin" on their Supabase user (only the
// service role can set app_metadata, so users can't grant it to themselves),
// or are listed in ADMIN_EMAILS.
function isAdmin(user) {
  if (user.app_metadata?.role === "admin") return true;
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user.email && admins.includes(user.email.toLowerCase()));
}

// Verifies the bearer token from a request against Supabase Auth. Returns
// null (never throws) when there's no token, no configured Supabase project,
// or the token doesn't check out — callers treat that as "not signed in".
async function getAuthedUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    isAdmin: isAdmin(data.user),
  };
}

module.exports = { getAuthedUser, isAdmin };
