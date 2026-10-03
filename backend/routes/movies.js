const express = require("express");
const router = express.Router();
const store = require("../../services/store");
const {
  getNowPlaying,
  getUpcoming,
  getMovieDetails,
  getTrailers,
} = require("../../services/tmdbService");
const cache = new Map();
async function respond(req, res, key, loader, { allowEmpty = false } = {}) {
  try {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return res.json(hit.data);
    const data = await loader();
    if (!data || (!allowEmpty && Array.isArray(data) && !data.length))
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
const cinemas = new Set(["edinburgh", "glasgow", "london"]);
// Films with screenings at a cinema. The schedule assigns films to auditorium
// slots independently of date, so today's programme is the whole run.
async function showingAt(cinema) {
  const films = await getNowPlaying();
  const screenings = await store.buildScreenings(films, { cinema });
  const ids = new Set(screenings.map((s) => s.movieId));
  return films.filter((film) => ids.has(film.id));
}
router.get("/showing", (req, res) => {
  const cinema = String(req.query.cinema || "edinburgh");
  if (!cinemas.has(cinema))
    return res.status(400).json({ error: "Unknown cinema" });
  return respond(req, res, `showing:${cinema}`, () => showingAt(cinema));
});
// Search is limited to films actually showing, never the whole TMDB catalogue.
router.get("/search", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2)
    return res.status(400).json({
      error: "Search query must contain at least 2 characters",
      code: "INVALID_QUERY",
    });
  const needle = query.toLowerCase();
  return respond(
    req,
    res,
    `search:${needle}`,
    async () =>
      (await getNowPlaying()).filter((film) =>
        film.title.toLowerCase().includes(needle),
      ),
    { allowEmpty: true },
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
