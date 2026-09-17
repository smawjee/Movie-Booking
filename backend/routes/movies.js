const express = require("express");
const router = express.Router();
const {
  getNowPlaying,
  searchMovies,
  getUpcoming,
  getMovieDetails,
  getTrailers,
} = require("../../services/tmdbService");
const cache = new Map();
async function respond(req, res, key, loader) {
  try {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return res.json(hit.data);
    const data = await loader();
    if (!data || (Array.isArray(data) && !data.length))
      throw new Error("TMDB returned no usable results");
    cache.set(key, { data, expires: Date.now() + 5 * 60 * 1000 });
    res.json(data);
  } catch (error) {
    console.error(`[movies:${key}]`, error.message);
    res.status(502).json({
      error: "Movie service temporarily unavailable",
      code: "MOVIE_SERVICE_ERROR",
    });
  }
}
router.get("/now-playing", (req, res) =>
  respond(req, res, "now-playing", getNowPlaying),
);
router.get("/upcoming", (req, res) =>
  respond(req, res, "upcoming", getUpcoming),
);
router.get("/trailers", (req, res) =>
  respond(req, res, "trailers", getTrailers),
);
router.get("/search", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2)
    return res.status(400).json({
      error: "Search query must contain at least 2 characters",
      code: "INVALID_QUERY",
    });
  return respond(req, res, `search:${query.toLowerCase()}`, () =>
    searchMovies(query),
  );
});
router.get("/details/:id", (req, res) => {
  if (!/^\d+$/.test(req.params.id))
    return res
      .status(400)
      .json({ error: "Invalid movie ID", code: "INVALID_MOVIE_ID" });
  return respond(req, res, `details:${req.params.id}`, () =>
    getMovieDetails(req.params.id),
  );
});
module.exports = router;
