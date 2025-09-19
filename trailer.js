import { getTrailers } from "./services/tmdbService.js";

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("trailers-container");
  container.innerHTML = "<p>Loading trailers...</p>";

  try {
    const trailers = await getTrailers();

    if (trailers.length === 0) {
      container.innerHTML = "<p>No trailers available right now.</p>";
      return;
    }

    container.innerHTML = ""; // clear loading text

    trailers.forEach(trailer => {
      const trailerDiv = document.createElement("div");
      trailerDiv.classList.add("trailer-card");

      trailerDiv.innerHTML = `
        <h3>${trailer.title} <span class="rating">[${trailer.rating}]</span></h3>
        <div class="video-wrapper">
          <iframe 
            src="${trailer.trailerUrl}" 
            frameborder="0" 
            allowfullscreen 
            loading="lazy"
          ></iframe>
        </div>
      `;

      container.appendChild(trailerDiv);
    });
  } catch (error) {
    console.error("Error fetching trailers:", error);
    container.innerHTML = "<p>Failed to load trailers.</p>";
  }
});
