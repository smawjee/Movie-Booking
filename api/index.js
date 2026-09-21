// Vercel serverless entry point. The Express app itself lives in
// backend/index.js so it can also run as a plain Node server locally
// (npm start / npm run dev:server) — this file just re-exports it for
// Vercel's Node.js runtime, which treats an exported Express app as a
// request handler.
module.exports = require("../backend/index.js");
