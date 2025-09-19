// manage‑bookings.js

document.addEventListener("DOMContentLoaded", () => {
  const bookingsContainer = document.getElementById("bookingsList");
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));

  if (!loggedInUser?.email) {
    bookingsContainer.innerHTML = "<p>Please log in to view your bookings.</p>";
    return;
  }

  // 1️⃣ Load & filter for this user
  let allBookings = JSON.parse(localStorage.getItem("cinegoBookings")) || [];
  let userBookings = allBookings.filter(b => b.user === loggedInUser.email);

  // 2️⃣ Drop any whose show date has passed
  const today = new Date();
  today.setHours(0,0,0,0);
  userBookings = userBookings.filter(b => {
    const showDate = new Date(b.date);
    return showDate >= today;
  });

  if (!userBookings.length) {
    bookingsContainer.innerHTML = "<p>You have no upcoming bookings.</p>";
    return;
  }

  // 3️⃣ Render
  bookingsContainer.innerHTML = userBookings.map(b => {
    let posterUrl = b.poster || "";
    if (posterUrl && !posterUrl.startsWith("http")) {
      posterUrl = `https://image.tmdb.org/t/p/w500${posterUrl}`;
    }

    const dateStr = new Date(b.date).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const seats = Array.isArray(b.seats)
      ? b.seats.map(s=>s.seatNumber||s).join(", ")
      : b.seats;
    const total = parseFloat(b.totalPaid||0).toFixed(2);

    return `
      <div class="booking-card" id="booking-${b.timestamp}">
        <img src="${posterUrl}"
             alt="${b.movie}"
             class="booking-poster"
             onerror="this.src='fallback.jpg';" />
        <div class="booking-details">
          <h3>${b.movie}</h3>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Time:</strong> ${b.start} – ${b.end}</p>
          <p><strong>Screen:</strong> ${b.screen}</p>
          <p><strong>Format:</strong> ${b.format}</p>
          <p><strong>Language:</strong> ${b.language}</p>
          <p><strong>Runtime:</strong> ${b.runtime}</p>
          <p><strong>Seats:</strong> ${seats}</p>
          <p><strong>Total Paid:</strong> £${total}</p>
          <div class="booking-actions">
            <button class="cancel-btn" data-ts="${b.timestamp}">Cancel</button>
            <button class="pdf-btn"    data-ts="${b.timestamp}">Download Ticket</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // 4️⃣ Wire up Cancel
  document.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.ts));
  });

  // 5️⃣ Wire up PDF download
  document.querySelectorAll(".pdf-btn").forEach(btn => {
    btn.addEventListener("click", () => generatePDF(btn.dataset.ts));
  });
});


function cancelBooking(timestamp) {
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));
  let all = JSON.parse(localStorage.getItem("cinegoBookings")) || [];
  all = all.filter(b => !(b.user === loggedInUser.email && b.timestamp === timestamp));
  localStorage.setItem("cinegoBookings", JSON.stringify(all));
  alert("Booking cancelled.");
  location.reload();
}


async function generatePDF(timestamp) {
  const { jsPDF } = window.jspdf;
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const all = JSON.parse(localStorage.getItem("cinegoBookings")) || [];
  const b = all.find(x => x.user === loggedInUser.email && x.timestamp === timestamp);
  if (!b) return alert("Booking not found.");

  // 1) Grab page logo
  const pageLogo = document.querySelector(".logo-img");
  let logoDataURL = null;
  if (pageLogo) {
    try {
      logoDataURL = await fetchImageAsDataURL(pageLogo.src);
    } catch (e) {
      console.warn("Could not embed logo:", e);
    }
  }

  // 2) Draw PDF
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  // Logo top‑right
  if (logoDataURL) {
    const logoWidth = 100;
    const logoHeight = (logoWidth * pageLogo.naturalHeight) / pageLogo.naturalWidth;
    doc.addImage(
      logoDataURL, "PNG",
      doc.internal.pageSize.getWidth() - margin - logoWidth,
      y - 10,
      logoWidth, logoHeight
    );
  }

  // Title
  doc.setFont("helvetica", "bold")
     .setFontSize(22)
     .setTextColor(0, 255, 150)
     .text("Cinego Movie Ticket", margin, y += 30);

  // Underline
  doc.setDrawColor(0,255,150)
     .setLineWidth(1.5)
     .line(margin, y += 5, doc.internal.pageSize.getWidth() - margin, y);

  // Body text
  doc.setFont("helvetica", "normal")
     .setFontSize(12)
     .setTextColor(0);

  const dateStr = new Date(b.date).toLocaleString([], {
    dateStyle: "medium", timeStyle: "short"
  });
  const leftX = margin;
  const rightX = doc.internal.pageSize.getWidth() / 2 + margin / 2;
  y += 20;

  // Left column
  doc.text("Movie:", leftX, y);
  doc.text(b.movie, leftX + 60, y);
  doc.text("Date:", leftX, y += 20);
  doc.text(dateStr, leftX + 60, y);
  doc.text("Screen/Time:", leftX, y += 20);
  doc.text(`${b.screen} / ${b.start}–${b.end}`, leftX + 100, y);
  doc.text("Format:", leftX, y += 20);
  doc.text(b.format, leftX + 60, y);
  doc.text("Language:", leftX, y += 20);
  doc.text(b.language, leftX + 60, y);
  doc.text("Runtime:", leftX, y += 20);
  doc.text(b.runtime, leftX + 60, y);

  // Right column
  y = margin + 100;
  doc.text("Seats:", rightX, y);
  doc.text(
    Array.isArray(b.seats)
      ? b.seats.map(s=>s.seatNumber||s).join(", ")
      : b.seats,
    rightX + 40, y
  );
  doc.text("Total Paid:", rightX, y += 20);
  doc.text(`£${parseFloat(b.totalPaid).toFixed(2)}`, rightX + 60, y);
  doc.text("Booked By:", rightX, y += 20);
  doc.text(loggedInUser.email, rightX + 80, y);

  // Footer
  doc.setFontSize(10)
     .setTextColor(100)
     .text(
       "Enjoy your movie! Please arrive 15 minutes early.",
       margin, doc.internal.pageSize.getHeight() - margin
     );

  const safeTitle = b.movie.replace(/[^\w]/g, "_");
  doc.save(`${safeTitle}_ticket.pdf`);
}


// Helper to fetch an image URL and return a base64 data URL
async function fetchImageAsDataURL(url) {
  const resp = await fetch(url, { mode: 'cors' });
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}
