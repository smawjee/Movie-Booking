// whatson.js

(() => {
  const API_BASE = 'http://localhost:5000/api/movies';

  // Maps for genres and languages
  const genreMap = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
  };
  const languageMap = {
    en: "English", hi: "Hindi", ur: "Urdu", fr: "French",
    es: "Spanish", de: "German", it: "Italian", ja: "Japanese",
    ko: "Korean", zh: "Chinese", te: "Telugu", ta: "Tamil",
    ml: "Malayalam", mr: "Marathi", bn: "Bengali", ru: "Russian",
    ge: "German"
  };

  // Cinema showtime hours
  const cinemaTimings = {
    edinburgh: [11,13,15,17,19,21],
    glasgow:   [10,12,14,16,18,20],
    london:    [9,11,13,15,17,19]
  };

  const screens2D = [1,2,3,7,8,9,10];
  const screens3D = [4,5,6];
  const likely3DGenreIDs = [28,12,16,878,14,27];

  let allMovies = [];
  let selectedGenres = new Set();
  let selectedLanguages = new Set();
  let selectedAge = "";
  const screenTracker = {};

  function getSelectedCinema() {
    const sel = document.getElementById("cinemaSelect");
    return sel ? sel.value.toLowerCase() : "edinburgh";
  }

  function getBadgeClass(r) {
    r = (r||"").toUpperCase();
    if (r==="U")   return "badge-u";
    if (r==="PG")  return "badge-pg";
    if (r==="12"||r==="12A") return "badge-12";
    if (r==="15")  return "badge-15";
    if (r==="18")  return "badge-18";
    return "badge-nr";
  }

  function getNextNDays(n) {
    const days = [], opts={weekday:"short",day:"numeric",month:"short"};
    for(let i=0;i<n;i++){
      const d=new Date(); d.setDate(d.getDate()+i);
      days.push(d.toLocaleDateString("en-GB",opts));
    }
    return days;
  }

  function formatTime(d){
    return d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  }

  function shouldUse3D(movie,cinema){
    let hash=0, key=movie.title+"-"+cinema;
    for(let c of key) hash=(c.charCodeAt(0)+(hash<<5)-hash)|0;
    return movie.genre_ids.some(id=>likely3DGenreIDs.includes(id)) && (hash%2===0);
  }

  function isConflict(start,end,slots){
    const s=new Date("1970-01-01T"+start+":00");
    const e=new Date("1970-01-01T"+end  +":00");
    return slots.some(slot=>{
      const ss=new Date("1970-01-01T"+slot.start+":00");
      const se=new Date("1970-01-01T"+slot.end  +":00");
      return s<se && e>ss;
    });
  }
function generateShowtimes(movie, cinema, day) {
  const runtime = parseInt(movie.runtime, 10) || 120;
  const is3D    = shouldUse3D(movie, cinema);
  const hours   = cinemaTimings[cinema] || cinemaTimings.edinburgh;
  const screens = is3D ? screens3D : screens2D;
  const fmt     = is3D ? "3D Lux" : "2D Lux";

  screenTracker[day] = screenTracker[day] || {};
  const slots = [];

  outer: for (let h of hours) {
    const startD = new Date();
    startD.setHours(h, 0, 0, 0);
    const endD = new Date(startD.getTime() + runtime * 60000);
    const s = formatTime(startD), e = formatTime(endD);

    for (let scr of screens) {
      screenTracker[day][scr] = screenTracker[day][scr] || [];
      if (!isConflict(s, e, screenTracker[day][scr])) {
        screenTracker[day][scr].push({ start: s, end: e });

        const price = (movie.rating || "U").toUpperCase() === "U"
          ? (is3D ? "£5.99" : "£3.99")
          : (is3D ? "£9.99" : "£7.99");

        const params = new URLSearchParams({
          movie:    movie.title,
          screen:   scr,
          start:    s,
          end:      e,
          format:   fmt,
          price,
          rating:   movie.rating || "",
          poster:   movie.poster_path || "",
          language: movie.language || "",
          runtime:  (movie.runtime || "").toString()
        }).toString();

        slots.push(`
          <div class="slot-card" onclick="location.href='booking.html?${params}'">
            <div><strong>${s} – ${e}</strong></div>
            <div class="slot-meta">
              <span>Screen ${scr}</span> • <span>${fmt}</span>
            </div>
            <div class="price">${price}</div>
          </div>
        `);
        break outer;
      }
    }
  }

  return slots.length
    ? { [day]: slots.join("") }
    : { [day]: "<p>No showtimes available</p>" };
}


  function assignMoviesToDays(movies,days){
    const out={};
    movies.forEach((m,i)=>{
      const day=days[i%days.length];
      (out[day]=out[day]||[]).push(m);
    });
    return out;
  }

  // ── new: read ?movie=… ─────────────────────────────────────
  function getQueryParam(key){
    return new URLSearchParams(location.search).get(key);
  }
  function renderSearchedMovie(name){
    const lower=(name||"").toLowerCase();
    const matches = allMovies.filter(m=>m.title?.toLowerCase()===lower);
    renderMovies(matches.length?matches:[]);
  }

  function renderMovies(movies){
    const ctr=document.getElementById("whatsonList");
    if(!ctr) return;
    const cinema=getSelectedCinema();
    const days=getNextNDays(5);
    const asg=assignMoviesToDays(movies,days);
    ctr.innerHTML=days.map(day=>{
      return (asg[day]||[]).map(movie=>{
        const poster=movie.poster_path
                ?`https://image.tmdb.org/t/p/w500${movie.poster_path}`
                :"default-poster.jpg";
        const genres=movie.genre_ids.map(id=>genreMap[id]).join(",")||"N/A";
        const lang=languageMap[movie.language]||"Unknown";
        const cast=movie.cast?.slice(0,3).join(",")||"N/A";
        const rt=movie.runtime
                ?`${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m`
                :"N/A";
        const desc=movie.overview||"No description.";
        const showObj=generateShowtimes(movie,cinema,day);
        const showHTML=showObj[day];
        const m=showHTML.match(/booking\.html\?([^'"]+)/);
        const cardURL=m?`booking.html?${m[1]}`:"#";

        return `
          <div class="movie-list-item"
               onclick="location.href='${cardURL}'"
               style="cursor:pointer">
            <img src="${poster}" alt="${movie.title}">
            <div class="movie-details">
              <h3>${movie.title}</h3>
              <span class="rating-badge ${getBadgeClass(movie.rating)}">
                ${movie.rating||"NR"}
              </span>
              <p><strong>Genres:</strong> ${genres}</p>
              <p><strong>Cast:</strong> ${cast}</p>
              <p><strong>Language:</strong> ${lang}</p>
              <p><strong>Runtime:</strong> ${rt}</p>
              <p><strong>Description:</strong> ${desc}</p>
              <div class="showtimes">
                <strong>${day} Showtimes:</strong>
                <div class="showtime-grid">${showHTML}</div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }).join("");
  }

  function applyFilters(){
    const filtered=allMovies.filter(m=>{
      const g=m.genre_ids.map(id=>genreMap[id]);
      const okG=[...selectedGenres].every(x=>g.includes(x));
      const okL=!selectedLanguages.size||selectedLanguages.has(m.language);
      const okA=!selectedAge||m.rating?.toUpperCase()===selectedAge;
      return okG&&okL&&okA;
    });
    renderMovies(filtered);
  }
  function setupFilters(){
    document.querySelectorAll("#genreFilters button").forEach(b=>{
      b.onclick=()=>{
        const g=b.dataset.genre;
        b.classList.toggle("active");
        selectedGenres.has(g)?selectedGenres.delete(g):selectedGenres.add(g);
        applyFilters();
      };
    });
    document.querySelectorAll("#languageFilters button").forEach(b=>{
      b.onclick=()=>{
        const l=b.dataset.lang;
        b.classList.toggle("active");
        selectedLanguages.has(l)?selectedLanguages.delete(l):selectedLanguages.add(l);
        applyFilters();
      };
    });
    document.querySelectorAll("#ageFilters button").forEach(b=>{
      b.onclick=()=>{
        const a=b.dataset.age;
        selectedAge=(selectedAge===a?"":a);
        document.querySelectorAll("#ageFilters button")
                .forEach(x=>x.classList.remove("active"));
        if(selectedAge)
          document.querySelector(`#ageFilters button[data-age="${selectedAge}"]`)
                  .classList.add("active");
        applyFilters();
      };
    });
    const sel=document.getElementById("cinemaSelect");
    if(sel) sel.onchange=applyFilters;
  }

  document.addEventListener("DOMContentLoaded",async()=>{
    try{
      const res=await fetch(`${API_BASE}/now-playing`);
      allMovies=await res.json();

      const movieParam=getQueryParam("movie");
      if(movieParam) renderSearchedMovie(movieParam);
      else           renderMovies(allMovies);

      setupFilters();
    }catch(e){
      console.error("Failed to load movies:",e);
    }
  });
})();
