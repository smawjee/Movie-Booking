const fetch = require("node-fetch");
const { MAX_FILMS } = require("./schedule");
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const demoMovies = [
  {
    id: 900001,
    title: "The Last Horizon",
    overview:
      "A rescue crew crosses an uncharted solar storm to bring a stranded expedition home.",
    poster_path: null,
    rating: "12A",
    genre_ids: [12, 878],
    runtime: 118,
    language: "en",
    release_date: "2026-08-14",
  },
  {
    id: 900002,
    title: "Paddington Square",
    overview:
      "A warm family adventure through London filled with mishaps, friendship and marmalade.",
    poster_path: null,
    rating: "PG",
    genre_ids: [35, 10751],
    runtime: 96,
    language: "en",
    release_date: "2026-07-02",
  },
  {
    id: 900003,
    title: "Midnight Signal",
    overview:
      "A radio presenter receives a call that appears to come from tomorrow night.",
    poster_path: null,
    rating: "15",
    genre_ids: [27, 53],
    runtime: 104,
    language: "en",
    release_date: "2026-08-28",
  },
  {
    id: 900004,
    title: "Velocity",
    overview:
      "An elite driver enters a city-spanning race where every second changes the rules.",
    poster_path: null,
    rating: "12A",
    genre_ids: [28],
    runtime: 126,
    language: "en",
    release_date: "2026-09-04",
  },
  {
    id: 900005,
    title: "Small Wonders",
    overview:
      "A curious young inventor discovers an extraordinary world hiding in the family garden.",
    poster_path: null,
    rating: "U",
    genre_ids: [12, 10751],
    runtime: 88,
    language: "en",
    release_date: "2026-08-21",
  },
  {
    id: 900006,
    title: "The Quiet Room",
    overview:
      "A celebrated architect finds that her newest building remembers everyone who enters.",
    poster_path: null,
    rating: "15",
    genre_ids: [18, 53],
    runtime: 112,
    language: "en",
    release_date: "2026-09-01",
  },
  {
    id: 900007,
    title: "Monsoon Wedding Express",
    original_title: "मानसून वेडिंग एक्सप्रेस",
    overview:
      "Three families, one overnight train and a wedding that has to happen by sunrise.",
    poster_path: null,
    rating: "12A",
    genre_ids: [35, 10749],
    runtime: 142,
    language: "hi",
    release_date: "2026-09-12",
  },
  {
    id: 900008,
    title: "The Night Market",
    original_title: "야시장",
    overview:
      "A Seoul street-food vendor is pulled into a heist when a stranger pays with a stolen key.",
    poster_path: null,
    rating: "15",
    genre_ids: [80, 53],
    runtime: 117,
    language: "ko",
    release_date: "2026-09-19",
  },
  {
    id: 900009,
    title: "Paper Lanterns",
    original_title: "紙灯籠",
    overview:
      "An animated tale of a girl who follows a lantern festival into the world of spirits.",
    poster_path: null,
    rating: "PG",
    genre_ids: [16, 14, 10751],
    runtime: 101,
    language: "ja",
    release_date: "2026-08-30",
  },
  {
    id: 900010,
    title: "Last Train to Lyon",
    original_title: "Dernier train pour Lyon",
    overview:
      "Two strangers share a delayed train and one long conversation that changes both their lives.",
    poster_path: null,
    rating: "12A",
    genre_ids: [18, 10749],
    runtime: 98,
    language: "fr",
    release_date: "2026-09-05",
  },
  {
    id: 900011,
    title: "Starfall Highway",
    overview:
      "The cult road-movie classic about two drifters chasing a meteor across the desert.",
    poster_path: null,
    rating: "PG",
    genre_ids: [12, 878],
    runtime: 109,
    language: "en",
    release_date: "1987-06-19",
    classic: true,
  },
  {
    id: 900012,
    title: "The Lighthouse Keeper's Daughter",
    overview:
      "A sweeping Scottish romance, restored in 4K for its anniversary run.",
    poster_path: null,
    rating: "PG",
    genre_ids: [18, 10749],
    runtime: 124,
    language: "en",
    release_date: "1994-03-04",
    classic: true,
  },
];

async function fetchJson(url) {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`TMDB request failed with status ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== "object")
    throw new Error("TMDB returned an invalid response");
  return data;
}

// ✅ Helper to get UK certification properly
async function getCertification(movieId) {
  const url = `${BASE_URL}/movie/${movieId}/release_dates?api_key=${TMDB_API_KEY}`;
  const data = await fetchJson(url);

  const ukRelease = data.results.find((r) => r.iso_3166_1 === "GB");
  if (ukRelease) {
    const rated = ukRelease.release_dates.find(
      (entry) => entry.certification && entry.certification.trim() !== "",
    );
    return rated?.certification || "NR";
  }

  return "NR";
}

// Films in other languages that UK cinemas commonly programme. TMDB's GB
// "now playing" list is mostly English, so the most popular recent release
// in each of these is added to the programme.
const WORLD_LANGUAGES = [
  // South Asian
  "hi",
  "pa",
  "ta",
  "te",
  "ml",
  "kn",
  "ur",
  "bn",
  // East Asian
  "ko",
  "ja",
  "zh",
  // European and beyond
  "fr",
  "es",
  "it",
  "de",
  "pl",
  "tr",
  "pt",
];
const CLASSICS_PER_WEEK = 4;
const NOW_PLAYING_TTL_MS = 10 * 60 * 1000;

async function describe(movie) {
  const [certification, details, credits] = await Promise.all([
    getCertification(movie.id),
    fetchJson(
      `${BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}&language=en-US`,
    ),
    fetchJson(
      `${BASE_URL}/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}&language=en-US`,
    ),
  ]);
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    overview: movie.overview,
    poster_path: movie.poster_path,
    rating: certification,
    genre_ids: movie.genre_ids,
    runtime: details.runtime,
    language: details.original_language,
    release_date: movie.release_date,
    classic: Boolean(movie.classic),
    cast: credits.cast?.slice(0, 5).map((c) => c.name),
  };
}

const isoDay = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const dayNumber = () => Math.floor(Date.now() / 86400000);
const rotate = (list, by) =>
  list.length
    ? [...list.slice(by % list.length), ...list.slice(0, by % list.length)]
    : list;

// The most popular film released in the last ~2 months for each language.
async function worldCinema() {
  const picks = await Promise.allSettled(
    WORLD_LANGUAGES.map(async (code) => {
      const data = await fetchJson(
        `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US` +
          `&with_original_language=${code}&include_adult=false` +
          `&primary_release_date.gte=${isoDay(-60)}&primary_release_date.lte=${isoDay(7)}` +
          `&vote_count.gte=3&sort_by=popularity.desc&page=1`,
      );
      return data.results.find((movie) => movie.poster_path) || null;
    }),
  );
  // Not every language fits in a day's programme, so the order rotates
  // daily and each language gets its turn near the front.
  return rotate(
    picks
      .filter((pick) => pick.status === "fulfilled" && pick.value)
      .map((pick) => pick.value),
    dayNumber(),
  );
}

// Old favourites back on the big screen: a few well-loved films at least
// ten years old, changing every week.
async function classics() {
  const week = Math.floor(dayNumber() / 7);
  const data = await fetchJson(
    `${BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&region=GB&page=${(week % 5) + 1}`,
  );
  const cutoff = new Date().getFullYear() - 10;
  const old = data.results.filter(
    (movie) =>
      movie.poster_path && Number(movie.release_date?.slice(0, 4)) <= cutoff,
  );
  return rotate(old, week * CLASSICS_PER_WEEK)
    .slice(0, CLASSICS_PER_WEEK)
    .map((movie) => ({ ...movie, classic: true }));
}

// Two UK releases, then one world film, with a classic every seventh place,
// so the films that get showtimes (the first MAX_FILMS) always include
// world cinema and classics.
function mixProgramme(local, world, oldies = []) {
  const seen = new Set();
  const fresh = (list) =>
    list.filter((movie) => !seen.has(movie.id) && seen.add(movie.id));
  const uk = fresh(local);
  const extra = fresh(world);
  const replays = fresh(oldies);
  const mixed = [];
  let i = 0;
  while (i < uk.length || extra.length) {
    mixed.push(...uk.slice(i, i + 2));
    i += 2;
    if (extra.length) mixed.push(extra.shift());
  }
  replays.forEach((movie, n) =>
    mixed.splice(Math.min(4 + n * 7, mixed.length), 0, movie),
  );
  return mixed;
}

let nowPlayingCache = null;
async function getNowPlaying() {
  if (!TMDB_API_KEY) return demoMovies;
  // Every screenings request needs this list; dozens of TMDB calls per
  // request would be slow and hit rate limits, so it is shared for a while.
  if (nowPlayingCache && nowPlayingCache.expires > Date.now())
    return nowPlayingCache.movies;
  const pending = (async () => {
    const [local, world, oldies] = await Promise.all([
      fetchJson(
        `${BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1&region=GB`,
      ).then((data) => data.results),
      worldCinema().catch(() => []),
      classics().catch(() => []),
    ]);
    // Only films that can get a showtime are worth the detail lookups.
    return Promise.all(
      mixProgramme(local, world, oldies).slice(0, MAX_FILMS).map(describe),
    );
  })();
  nowPlayingCache = {
    movies: pending,
    expires: Date.now() + NOW_PLAYING_TTL_MS,
  };
  pending.catch(() => {
    nowPlayingCache = null;
  });
  return pending;
}

async function getUpcoming() {
  if (!TMDB_API_KEY) return demoMovies.slice().reverse();
  const url = `${BASE_URL}/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1&region=GB`;
  const data = await fetchJson(url);

  const moviesWithRatings = await Promise.all(
    data.results.map(async (movie) => {
      const rating = await getCertification(movie.id);
      return { ...movie, rating };
    }),
  );

  return moviesWithRatings;
}

async function getMovieDetails(movieId) {
  if (!TMDB_API_KEY)
    return demoMovies.find((movie) => movie.id === Number(movieId)) || null;
  const url = `${BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=release_dates`;
  const data = await fetchJson(url);

  const rating = await getCertification(movieId);

  return {
    id: data.id,
    title: data.title,
    overview: data.overview,
    poster_path: data.poster_path,
    release_date: data.release_date,
    rating: rating,
  };
}

async function searchMovies(query) {
  if (!TMDB_API_KEY)
    return demoMovies.filter((movie) =>
      movie.title.toLowerCase().includes(String(query).toLowerCase()),
    );
  const url = `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(query)}&page=1`;
  const data = await fetchJson(url);

  const resultsWithRatings = await Promise.all(
    data.results.map(async (movie) => {
      const rating = await getCertification(movie.id);
      return { ...movie, rating };
    }),
  );

  return resultsWithRatings;
}

async function getTrailers() {
  if (!TMDB_API_KEY) return [];
  const list = (kind) =>
    fetchJson(
      `${BASE_URL}/movie/${kind}?api_key=${TMDB_API_KEY}&language=en-US&page=1&region=GB`,
    );
  const [nowPlayingData, upcomingData] = await Promise.all([
    list("now_playing"),
    list("upcoming"),
  ]);
  const nowIds = new Set(nowPlayingData.results.map((m) => m.id));
  const movies = [
    ...nowPlayingData.results
      .slice(0, 12)
      .map((m) => ({ ...m, status: "now-showing" })),
    ...upcomingData.results
      .filter((m) => !nowIds.has(m.id))
      .slice(0, 8)
      .map((m) => ({ ...m, status: "coming-soon" })),
  ];

  const trailers = await Promise.all(
    movies.map(async (movie) => {
      const videosData = await fetchJson(
        `${BASE_URL}/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`,
      );
      const trailer = videosData.results.find(
        (v) => v.site === "YouTube" && v.type === "Trailer",
      );

      const rating = await getCertification(movie.id);

      if (trailer) {
        return {
          id: movie.id,
          title: movie.title,
          trailerKey: trailer.key,
          trailerUrl: `https://www.youtube.com/embed/${trailer.key}`,
          rating: rating,
          status: movie.status,
          overview: movie.overview,
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          releaseDate: movie.release_date,
        };
      }
      return null;
    }),
  );

  return trailers.filter(Boolean);
}

module.exports = {
  WORLD_LANGUAGES,
  CLASSICS_PER_WEEK,
  mixProgramme,
  getNowPlaying,
  getUpcoming,
  getMovieDetails,
  searchMovies,
  getTrailers,
};
