import { showPaymentModal } from "./paymentModal.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1️⃣ Read URL params
  const params     = new URLSearchParams(window.location.search);
  const movieTitle = decodeURIComponent(params.get("movie") || "") || "Untitled";
  const screen     = params.get("screen") || "";
  const start      = params.get("start")  || "";
  const end        = params.get("end")    || "";
  const format     = params.get("format") || "";
  const poster     = params.get("poster") || "";
  let   rating     = (params.get("rating") || "U").trim().toUpperCase();

  // 2️⃣ Extract raw language code & runtime minutes
  const languageCode = params.get("language") || "";
  const runtimeVal   = parseInt(params.get("runtime"), 10);

  // 3️⃣ Humanize language
  let language = "Unknown";
  if (/^[a-z]{2,3}$/i.test(languageCode) && window.Intl?.DisplayNames) {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    language = dn.of(languageCode.toLowerCase()) || languageCode;
  } else if (languageCode) {
    language = languageCode;
  }

  // 4️⃣ Humanize runtime
  let runtimeText = "N/A";
  if (!isNaN(runtimeVal) && runtimeVal > 0) {
    const h = Math.floor(runtimeVal / 60);
    const m = runtimeVal % 60;
    runtimeText = `${h}h ${m}m`;
  }

  // 5️⃣ Populate header
  document.getElementById("movieTitle").innerText       = movieTitle;
  document.getElementById("screenLabel").innerText     = `Screen ${screen}`;
  document.getElementById("startTime").innerText       = start;
  document.getElementById("endTime").innerText         = end;
  document.getElementById("format").innerText          = format;
  document.getElementById("bookingLanguage").innerText = language;
  document.getElementById("bookingRuntime").innerText  = runtimeText;
  document.getElementById("screenNumber").innerText    = screen;

  // 6️⃣ Render poster
  if (poster) {
    const img = document.createElement("img");
    img.src       = poster.startsWith("http")
                      ? poster
                      : `https://image.tmdb.org/t/p/w500${poster}`;
    img.alt       = `${movieTitle} Poster`;
    img.className = "poster-img";
    document.querySelector(".booking-header").prepend(img);
  }

  // 7️⃣ Pricing logic (unchanged) …
  const is3D = format.toUpperCase().includes("3D");
  let basePrices;
  if (rating === "U") {
    basePrices = is3D
      ? { superSaver: 5.99, saver: 6.99, lux: 7.99 }
      : { superSaver: 3.99, saver: 4.99, lux: 5.99 };
  } else {
    basePrices = is3D
      ? { superSaver: 9.99, saver: 10.99, lux: 11.99 }
      : { superSaver: 7.99, saver: 8.99, lux: 9.99 };
  }
  const seatPrices = {
    SuperSaver: basePrices.superSaver,
    Saver:      basePrices.saver,
    Lux:        basePrices.lux
  };

  // 8️⃣ Build seat map (unchanged) …
  const rows        = ["A","B","C","D","E","F"];
  const seatsPerRow = 12;
  const allSeats    = rows.flatMap(r =>
    Array.from({ length: seatsPerRow }, (_, i) => `${r}${i+1}`)
  );

  function hashString(s) {
    return Math.abs(s.split('').reduce((h,ch) =>
      ((h<<5)-h) + ch.charCodeAt(0), 0
    ));
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ (a>>>15), 1 | a);
      t = t + Math.imul(t ^ (t>>>7), 61 | t) ^ t;
      return ((t ^ (t>>>14))>>>0) / 4294967296;
    }
  }

  const rand          = mulberry32(hashString(`${movieTitle}-${screen}-${start}`));
  const occupiedCount = 5 + Math.floor(rand()*21);
  const occupied      = [...allSeats].sort(() => rand() - 0.5).slice(0, occupiedCount);

  const seatMap = document.getElementById("seatMap");
  const selected= new Set();
  seatMap.innerHTML = "";

  rows.forEach(r => {
    const rowEl = document.createElement("div");
    rowEl.className = "seat-row";
    rowEl.innerHTML = `<span class="row-label">${r}</span>`;

    allSeats.filter(id => id.startsWith(r)).forEach(id => {
      const d = document.createElement("div");
      d.className   = "seat";
      d.textContent = id.slice(1);
      d.dataset.id  = id;

      if (occupied.includes(id)) {
        d.classList.add("occupied");
      } else {
        const tier = ["A","B"].includes(r)
          ? "SuperSaver"
          : ["C","F"].includes(r)
            ? "Saver"
            : "Lux";
        d.classList.add(tier.toLowerCase());
        d.dataset.tier = tier;
        d.addEventListener("click", () => {
          if (selected.has(id)) {
            selected.delete(id);
            d.classList.remove("selected");
          } else {
            selected.add(id);
            d.classList.add("selected");
          }
          updateSummary();
        });
      }
      rowEl.appendChild(d);
    });

    seatMap.appendChild(rowEl);
  });

  function updateSummary() {
    const listEl  = document.getElementById("selectedList");
    const totalEl = document.getElementById("totalPrice");
    listEl.innerHTML = "";
    let total = 0;

    if (!selected.size) {
      listEl.innerHTML = "<p>No seats selected.</p>";
    } else {
      selected.forEach(id => {
        const tier  = document.querySelector(`[data-id="${id}"]`).dataset.tier;
        const price = seatPrices[tier];
        total += price;
        const p = document.createElement("p");
        p.textContent = `${id} – £${price.toFixed(2)}`;
        listEl.appendChild(p);
      });
    }

    totalEl.innerText = total.toFixed(2);
  }
  updateSummary();

  // 9️⃣ REVIEW & PAY → persist everything
  document.getElementById("payNowBtn").addEventListener("click", () => {
    const seatsArr = Array.from(selected).map(id => {
      const tier  = document.querySelector(`[data-id="${id}"]`).dataset.tier;
      const price = seatPrices[tier];
      return { seatNumber:id, tier, price:price.toFixed(2) };
    });
    if (!seatsArr.length) {
      alert("Please select at least one seat.");
      return;
    }
    const total = seatsArr
      .reduce((sum,s) => sum + parseFloat(s.price), 0)
      .toFixed(2);

    const booking = {
      movie:     movieTitle,
      poster,
      screen,
      start,
      end,
      format,
      rating,
      language,       // e.g. "English"
      runtime: runtimeText, // e.g. "2h 36m"
      seats:      seatsArr,
      totalPaid:  total,
      date:       new Date().toISOString()
    };

    // Persist to localStorage
    localStorage.setItem("lastBooking",       JSON.stringify(booking));
    localStorage.setItem("tempMovieTitle",    movieTitle);
    localStorage.setItem("tempScreen",        screen);
    localStorage.setItem("tempStart",         start);
    localStorage.setItem("tempEnd",           end);
    localStorage.setItem("tempFormat",        format);
    localStorage.setItem("tempRating",        rating);
    localStorage.setItem("tempMoviePoster",   poster);
    localStorage.setItem("tempBookingDate",   booking.date);
    localStorage.setItem("tempSelectedSeats", JSON.stringify(seatsArr));
    localStorage.setItem("tempLanguage",      language);
    localStorage.setItem("tempRuntime",       runtimeText);

    showPaymentModal(total);
  });
});
