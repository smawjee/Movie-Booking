const { createClient } = require("@supabase/supabase-js");
const configured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const client = configured
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  : null;
module.exports = { supabase: client, supabaseConfigured: configured };
