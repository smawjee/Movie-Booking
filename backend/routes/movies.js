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
const { isCinema } = require("../../services/cinemas");
const { addDays, ukNow, upcomingOnly } = require("../../services/showtimes");
// Films with a showtime still to come at a cinema over the next week, each
// with the dates it plays. A day's schedule is fixed once created (people may
// have booked it), so today can lack films that later days include, and
// today's last showing may already have started.
const SHOWING_DAYS = 7;
async function showingAt(cinema) {
  const films = await getNowPlaying();
  const today = ukNow().date;
  const days = Array.from({ length: SHOWING_DAYS }, (_, i) =>
    addDays(today, i),
  );
  const perDay = await Promise.all(
    days.map((date) => store.buildScreenings(films, { cinema, date })),
  );
  const dates = new Map();
  perDay.forEach((screenings, i) => {
    for (const s of upcomingOnly(screenings)) {
      const list = dates.get(s.movieId) || [];
      if (!list.includes(days[i])) list.push(days[i]);
      dates.set(s.movieId, list);
    }
  });
  return films
    .filter((film) => dates.has(film.id))
    .map((film) => ({ ...film, dates: dates.get(film.id) }));
}
router.get("/showing", (req, res) => {
  const cinema = String(req.query.cinema || "edinburgh");
  if (!isCinema(cinema))
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
