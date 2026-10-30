// Everything Cinebot knows, gathered once per question and handed to the
// model in a single prompt: the programme, the next few days of showtimes at
// the cinema being asked about, prices, formats, memberships and rules.
// Screenings get short aliases (S1, S2…) so the model can point at one
// without spending tokens on UUIDs; the server maps them back.
const { getNowPlaying } = require("./tmdbService");
const { CINEMAS } = require("./cinemas");
const store = require("./store");
const { addDays, ukNow, upcomingOnly } = require("./showtimes");

const GENRES = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-fi",
  53: "Thriller",
  10752: "War",
  37: "Western",
};
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const RATING_RULES = {
  U: "Suitable for all audiences.",
  PG: "Parental guidance; some scenes may be unsuitable for young children.",
  "12A": "Under-12s must be accompanied by an adult.",
  15: "Everyone must be 15 or older; photo ID may be requested.",
  18: "Everyone must be 18 or older; signed-in bookers need a verified ID.",
};

// Building a day's screenings touches the database, so each cinema/day is
// reused for a couple of minutes across questions.
const DAY_TTL_MS = 2 * 60 * 1000;
const dayCache = new Map();
function screeningsFor(films, cinema, date) {
  const key = `${cinema}|${date}`;
  const hit = dayCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.screenings;
  const screenings = store.buildScreenings(films, { cinema, date });
  dayCache.set(key, { screenings, expires: Date.now() + DAY_TTL_MS });
  Promise.resolve(screenings).catch(() => dayCache.delete(key));
  return screenings;
}

/** The cinema named most recently in the conversation, else Edinburgh. */
function pickCinema(texts) {
  for (const text of [...texts].reverse()) {
    const found = CINEMAS.find(
      (c) =>
        new RegExp(`\\b${c.slug}\\b`, "i").test(text) ||
        new RegExp(`\\b${c.city}\\b`, "i").test(text),
    );
    if (found) return found;
  }
  return CINEMAS.find((c) => c.slug === "edinburgh") || CINEMAS[0];
}

/** Today and tomorrow, plus any weekday or weekend the question mentions. */
function pickDates(message, today) {
  const dates = new Set([today, addDays(today, 1)]);
  const todayIndex = new Date(`${today}T12:00:00Z`).getUTCDay();
  const ahead = (day) => addDays(today, (day - todayIndex + 7) % 7);
  WEEKDAYS.forEach((name, day) => {
    if (new RegExp(`\\b${name.slice(0, 3)}`, "i").test(message))
      dates.add(ahead(day));
  });
  if (/weekend/i.test(message)) {
    dates.add(ahead(6));
    dates.add(ahead(0));
  }
  return [...dates].sort().slice(0, 4);
}

const day = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const languageNames = new Intl.DisplayNames(["en-GB"], { type: "language" });
const languageName = (code) => {
  try {
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
};
const pounds = (pence) => `£${(pence / 100).toFixed(2)}`;

async function buildContext(message, history = []) {
  const films = await getNowPlaying();
  const cinema = pickCinema([
    ...history.filter((h) => h.role === "user").map((h) => h.text),
    message,
  ]);
  const now = ukNow();
  const dates = pickDates(message, now.date);
  const days = await Promise.all(
    dates.map(async (date) => ({
      date,
      screenings: upcomingOnly(await screeningsFor(films, cinema.slug, date)),
    })),
  );
  const offers = await store.getActiveOffers().catch(() => []);

  const aliases = {};
  let n = 0;
  const filmById = new Map(films.map((f) => [f.id, f]));
  const showtimeLines = days.map(({ date, screenings }) => {
    if (!screenings.length) return `${day(date)}: no showings left.`;
    const byFilm = new Map();
    for (const s of screenings) {
      const alias = `S${++n}`;
      aliases[alias] = {
        id: s.id,
        title: s.movieTitle,
        label: `${day(date)} ${s.time} · ${s.experience.name} · ${pounds(s.pricePence)}`,
      };
      const list = byFilm.get(s.movieTitle) || [];
      list.push(
        `${s.time} ${s.experience.name} ${pounds(s.pricePence)} [${alias}]`,
      );
      byFilm.set(s.movieTitle, list);
    }
    return [
      `${day(date)}${date === now.date ? " (today)" : ""}:`,
      ...[...byFilm].map(([title, times]) => `  ${title}: ${times.join(", ")}`),
    ].join("\n");
  });
  const programme = films.map((f) => {
    const genres = (f.genre_ids || []).map((g) => GENRES[g]).filter(Boolean);
    return [
      `- ${f.title}${f.release_date ? ` (${f.release_date.slice(0, 4)})` : ""}`,
      f.rating || "NR",
      f.runtime ? `${f.runtime} min` : null,
      genres.join("/") || null,
      f.language && f.language !== "en"
        ? `${languageName(f.language)} with English subtitles`
        : null,
      f.classic ? "classic re-release" : null,
      f.cast?.length ? `starring ${f.cast.slice(0, 3).join(", ")}` : null,
      f.overview ? `— ${f.overview.slice(0, 220)}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  });
  const plans = store.membershipPlans.map(
    (p) => `- ${p.name} ${pounds(p.pricePence)}/month: ${p.perks.join("; ")}`,
  );
  const formats = Object.values(store.experiences).map(
    (x) => `- ${x.name}: ${x.description} (+${pounds(x.surchargePence)})`,
  );

  const facts = `Now: ${day(now.date)} ${now.time} UK time.
Cinema in focus: ${cinema.name} (${cinema.city}). Other cinemas: ${CINEMAS.filter(
    (c) => c !== cinema,
  )
    .map((c) => c.city)
    .join(", ")}.

FILMS SHOWING (all cinemas):
${programme.join("\n")}

SHOWTIMES AT ${cinema.city.toUpperCase()}:
${showtimeLines.join("\n")}

PRICES: Standard ticket ${pounds(899)} plus format surcharge; premium seats (back rows) +£2.50.
FORMATS:
${formats.join("\n")}
MEMBERSHIPS (Cinego+):
${plans.join("\n")}
Verified students get 25% off tickets without a membership.
${offers.length ? `PROMO CODES: ${offers.map((o) => `${o.code} (${o.discountPercent}% off: ${o.description})`).join("; ")}` : ""}
AGE RATINGS: ${Object.entries(RATING_RULES)
    .map(([r, rule]) => `${r}: ${rule}`)
    .join(" ")}
FOOD: Sweet Popcorn £3.99, Loaded Nachos £5.24, Movie Night Combo £6.49, Raspberry Slush £4.74; order on the Food page and collect at the express counter.`;
  return { facts, aliases, cinema, films };
}

module.exports = { buildContext, pickCinema, pickDates, RATING_RULES };
