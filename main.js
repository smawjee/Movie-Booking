const API_BASE = 'http://localhost:5000/api/movies';

const genreMap = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

function getBadgeClass(rating) {
  const val = (rating || '').toUpperCase();
  if (val === 'U') return 'badge-u';
  if (val === 'PG') return 'badge-pg';
  if (val === '12' || val === '12A') return 'badge-12';
  if (val === '15') return 'badge-15';
  if (val === '18') return 'badge-18';
  return 'badge-nr';
}

async function loadNowPlaying() {
  try {
    const res = await fetch(`${API_BASE}/now-playing`);
    const data = await res.json();

    // ✅ Make movies available globally for Trie + search
    window.allMovies = data;

    // ✅ Call Trie builder from searchmovies.js if defined
    if (typeof window.initSearchTrie === "function") {
      window.initSearchTrie();
    }

    const homepageContainer = document.getElementById('nowPlaying');
    const whatsonContainer = document.getElementById('whatsonGrid');

    if (homepageContainer) {
      homepageContainer.innerHTML = data.map(movie => `
        <div onclick="window.location.href='whatson.html?movie=${encodeURIComponent(movie.title)}'">
          <img src="https://image.tmdb.org/t/p/w200${movie.poster_path}" alt="${movie.title}">
          <p><strong>${movie.title}</strong></p>
          <span class="rating-badge ${getBadgeClass(movie.rating)}">${movie.rating || 'NR'}</span>
        </div>
      `).join('');
    }

    if (whatsonContainer) {
      whatsonContainer.innerHTML = data.map(movie => {
        const genreNames = movie.genre_ids?.map(id => genreMap[id]).join(', ') || 'N/A';
        const cast = movie.cast?.slice(0, 3).join(', ') || 'N/A';

        return `
          <div class="movie-card">
            <img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" />
            <div class="movie-info">
              <h3>${movie.title}</h3>
              <span class="rating-badge ${getBadgeClass(movie.rating)}">${movie.rating || 'NR'}</span>
              <p class="genre">Genres: ${genreNames}</p>
              <p class="cast">Cast: ${cast}</p>
              <p class="showtimes">Showtimes: <span>2:00 PM, 5:00 PM, 8:00 PM</span></p>
              <button class="book-btn" onclick="window.location.href='whatson.html?movie=${encodeURIComponent(movie.title)}'">Book Now</button>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Error loading now playing movies:', err);
  }
}

async function loadUpcoming() {
  try {
    const res = await fetch(`${API_BASE}/upcoming`);
    const data = await res.json();
    const container = document.getElementById('upcoming');
    if (!container) return;

    container.innerHTML = data.map(movie => `
      <div onclick="window.location.href='whatson.html?movie=${encodeURIComponent(movie.title)}'">
        <img src="https://image.tmdb.org/t/p/w200${movie.poster_path}" alt="${movie.title}">
        <p><strong>${movie.title}</strong><br> ${movie.release_date}</p>
        <span class="rating-badge ${getBadgeClass(movie.rating)}">${movie.rating || 'NR'}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading upcoming movies:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadNowPlaying();
  loadUpcoming();
});
