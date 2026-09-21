import { createClient } from "@supabase/supabase-js";
// Fallback defaults for this project's public Supabase URL/anon key. Neither
// is a secret — the anon key is meant to be embedded in client code and is
// protected by RLS, not by being hidden — so this just keeps the deployed
// site working even if VITE_SUPABASE_* isn't set as a Vercel env var yet.
const FALLBACK_URL = "https://rpkfbttvwlcscewkrnin.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwa2ZidHR2d2xjc2Nld2tybmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNzQ1MTUsImV4cCI6MjEwNDY1MDUxNX0.JaEE6axi6K3iuTLrBpKFrkybvJKF-ZSySX6hEhV2YkM";
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  FALLBACK_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const supabaseConfigured = Boolean(supabase);
