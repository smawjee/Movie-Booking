const fetch = require("node-fetch");
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

async function getNowPlaying() {
  if (!TMDB_API_KEY) return demoMovies;
  const url = `${BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1&region=GB`;
  const data = await fetchJson(url);

  const detailedMovies = await Promise.all(
    data.results.map(async (movie) => {
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
        overview: movie.overview,
        poster_path: movie.poster_path,
        rating: certification,
        genre_ids: movie.genre_ids,
        runtime: details.runtime,
        language: details.original_language,
        cast: credits.cast?.slice(0, 5).map((c) => c.name),
      };
    }),
  );

  return detailedMovies;
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
  const nowPlayingUrl = `${BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1&region=GB`;
  const nowPlayingData = await fetchJson(nowPlayingUrl);
  const movies = nowPlayingData.results.slice(0, 5);

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
        };
      }
      return null;
    }),
  );

  return trailers.filter(Boolean);
}

module.exports = {
  getNowPlaying,
  getUpcoming,
  getMovieDetails,
  searchMovies,
  getTrailers,
};
