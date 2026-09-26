const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
// Must come before express.json(): Stripe signature checks need the raw body.
app.use("/api", require("./routes/stripeWebhook"));
app.use(express.json());

const movieRoutes = require("./routes/movies");
app.use("/api/movies", movieRoutes);
app.use("/api", require("./routes/cinema"));
app.use("/api", require("./routes/tickets"));
app.use("/api", require("./routes/assistant"));

const reactDist = path.join(__dirname, "..", "frontend-dist");
const legacyFrontend = path.join(__dirname, "..", "frontend");
const staticRoot = fs.existsSync(path.join(reactDist, "index.html"))
  ? reactDist
  : legacyFrontend;

app.get("/api/health", (req, res) => {
  const { supabaseConfigured } = require("../services/supabaseClient");
  const integrations = {
    tmdb: Boolean(process.env.TMDB_API_KEY),
    supabase: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    supabaseBrowser: Boolean(
      process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
    ),
    openai: Boolean(process.env.OPENAI_API_KEY),
    langfuse: Boolean(
      process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
    ),
    gmail: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  };
  res.json({
    ok: true,
    database: supabaseConfigured ? "supabase" : "memory-fallback",
    assistant: process.env.OPENAI_API_KEY ? "openai" : "guided-fallback",
    email: integrations.gmail ? "gmail-smtp" : "preview",
    integrations,
    frontend: fs.existsSync(path.join(reactDist, "index.html"))
      ? "react-build"
      : "legacy",
  });
});

// Static file serving + SPA fallback are only needed when this app runs as
// a standalone Node server (local dev, or any non-Vercel host). On Vercel the
// built frontend is served directly from its CDN per vercel.json, and this
// Express app only ever receives /api/* requests there.
app.use(express.static(staticRoot));

app.get("/", (req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(staticRoot, "index.html"));
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`),
  );
}
