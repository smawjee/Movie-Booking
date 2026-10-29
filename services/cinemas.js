// Every Cinego location, and the screens each one has. All cinemas share one
// layout: a screen for each premium format plus extra Standard and 3D
// screens. supabase/migrations/20261029010000_more_cinemas_and_screens.sql
// creates the matching rows.
const CINEMAS = [
  { slug: "edinburgh", name: "Cinego Edinburgh", city: "Edinburgh" },
  { slug: "glasgow", name: "Cinego Glasgow", city: "Glasgow" },
  { slug: "london", name: "Cinego London West End", city: "London West End" },
  { slug: "manchester", name: "Cinego Manchester", city: "Manchester" },
  { slug: "birmingham", name: "Cinego Birmingham", city: "Birmingham" },
  { slug: "leeds", name: "Cinego Leeds", city: "Leeds" },
  { slug: "cardiff", name: "Cinego Cardiff", city: "Cardiff" },
  { slug: "belfast", name: "Cinego Belfast", city: "Belfast" },
];

// Screen number -> format. Screens 1-6 match the original layout.
const SCREENS = [
  "3d",
  "4dx",
  "dolby",
  "imax",
  "screenx",
  "standard",
  "standard",
  "standard",
  "standard",
  "3d",
].map((formatId, i) => ({ screenNumber: i + 1, formatId }));

const bySlug = new Map(CINEMAS.map((cinema) => [cinema.slug, cinema]));
const isCinema = (slug) => bySlug.has(slug);
const cinemaName = (slug) => bySlug.get(slug)?.name || "Cinego";

module.exports = { CINEMAS, SCREENS, isCinema, cinemaName };
