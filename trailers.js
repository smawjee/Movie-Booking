(() => {
  const API_BASE = 'http://localhost:5000/api/movies';
  let currentSlide = 0;
  let trailers = [];

  function getBadgeClass(rating) {
    const val = (rating || '').toUpperCase();
    if (val === 'U') return 'badge-u';
    if (val === 'PG') return 'badge-pg';
    if (val === '12' || val === '12A') return 'badge-12';
    if (val === '15') return 'badge-15';
    if (val === '18') return 'badge-18';
    return 'badge-nr';
  }

  function showSlide(index) {
    const container = document.getElementById('trailerSlideshow');
    if (!trailers.length || !container) return;

    const trailer = trailers[index];
    container.innerHTML = `
      <div class="trailer-slide">
        <iframe src="${trailer.trailerUrl}" allowfullscreen></iframe>
        <p>${trailer.title}</p>
        <span class="rating-badge ${getBadgeClass(trailer.rating)}">${trailer.rating || 'NR'}</span>
        <button class="book-btn" onclick="window.location.href='/booking.html?movieId=${trailer.id}'">Book Now</button>
      </div>
    `;
  }

  function nextSlide() {
    if (!trailers.length) return;
    currentSlide = (currentSlide + 1) % trailers.length;
    showSlide(currentSlide);
  }

  function prevSlide() {
    if (!trailers.length) return;
    currentSlide = (currentSlide - 1 + trailers.length) % trailers.length;
    showSlide(currentSlide);
  }

  window.prevSlide = prevSlide;
  window.nextSlide = nextSlide;

  async function loadTrailerSlideshow() {
    try {
      const res = await fetch(`${API_BASE}/trailers`);
      trailers = await res.json();
      showSlide(currentSlide);
    } catch (error) {
      const container = document.getElementById('trailerSlideshow');
      if (container) {
        container.innerHTML = `<p style="color:white;">No trailers available.</p>`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", loadTrailerSlideshow);
})();
