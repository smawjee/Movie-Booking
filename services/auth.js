const { supabase } = require("./supabaseClient");

// Verifies the bearer token from a request against Supabase Auth. Returns
// null (never throws) when there's no token, no configured Supabase project,
// or the token doesn't check out — callers treat that as "not signed in".
async function getAuthedUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email };
}

module.exports = { getAuthedUser };
