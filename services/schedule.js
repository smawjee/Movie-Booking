// A cinema's day: every screen runs a film at each showtime. Films are dealt
// round-robin across the slots (time first, then screen), so each slot at a
// given time shows a different film and the programme covers up to
// MAX_FILMS films; the most popular get a second showing on another screen.
const SHOWTIMES = [11, 14, 17, 20];
const MAX_FILMS = 30;

function planDay(movies, auditoriums, hours = SHOWTIMES) {
  const films = movies.slice(0, MAX_FILMS);
  if (!films.length || !auditoriums.length) return [];
  const screens = auditoriums.length;
  const plan = [];
  hours.forEach((hour, h) => {
    // Once every film has had a showing, later rounds shift films onto other
    // screens (and formats). The shift is fixed for the whole showtime so
    // no screen is used twice at once.
    const round = Math.floor((h * screens) / films.length);
    for (let s = 0; s < screens; s++) {
      const k = h * screens + s;
      plan.push({
        movie: films[k % films.length],
        auditorium: auditoriums[(s + round) % screens],
        hour,
      });
    }
  });
  return plan;
}

module.exports = { SHOWTIMES, MAX_FILMS, planDay };
