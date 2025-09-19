// confirmation.js

document.addEventListener("DOMContentLoaded", () => {
  // 1) Load last booking
  const raw = localStorage.getItem("lastBooking");
  if (!raw) return window.location.href = "index.html";

  let booking;
  try {
    booking = JSON.parse(raw);
  } catch {
    return window.location.href = "index.html";
  }

  // 2) Poster
  const posterEl = document.getElementById("confirmedPoster");
  if (booking.poster) {
    posterEl.src = booking.poster.startsWith("http")
      ? booking.poster
      : `https://image.tmdb.org/t/p/w500${booking.poster}`;
    posterEl.alt = `${booking.movie} Poster`;
  }

  // 3) Movie title
  document.getElementById("confirmedMovieTitle").textContent =
    booking.movie || "Unknown Movie";

  // 4) Date & time
  document.getElementById("ticketDate").textContent = booking.date
    ? new Date(booking.date).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "N/A";

  // 5) Screen • Time • Format
  document.getElementById("confirmedScreenInfo").textContent =
    `Screen ${booking.screen || "?"} • ${booking.start || "--:--"} – ${booking.end || "--:--"} • ${booking.format || "?"}`;

  // 6) Language
  document.getElementById("ticketLang").textContent =
    booking.language || "Unknown";

  // 7) Runtime (already humanized)
  document.getElementById("ticketRuntime").textContent =
    booking.runtime || "N/A";

  // 8) Seats
  const seatsEl = document.getElementById("confirmedSeats");
  let seatText = "None";
  if (Array.isArray(booking.seats) && booking.seats.length) {
    seatText = booking.seats
      .map(s =>
        typeof s === "object" && s.seatNumber
          ? `${s.seatNumber} (${s.tier}) – £${parseFloat(s.price).toFixed(2)}`
          : s
      )
      .join(", ");
  }
  seatsEl.textContent = seatText;

  // 9) Total paid
  document.getElementById("confirmedTotal").textContent = parseFloat(
    booking.totalPaid || 0
  ).toFixed(2);

  // 10) Membership Tier & Code
  const mEl = document.getElementById("ticketMembership");
  const parts = [];
  if (booking.membershipTier) parts.push(`${booking.membershipTier} Member`);
  if (booking.membershipCode) parts.push(`Code: ${booking.membershipCode}`);
  if (parts.length) {
    mEl.textContent = parts.join(" – ");
    mEl.style.display = "block";
  }

  // 11) QR Code
  // Build the string — include membership if present
  const qrLines = [
    `Movie: ${booking.movie}`,
    `Date:  ${new Date(booking.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
    `Screen: ${booking.screen}`,
    `Time:   ${booking.start} – ${booking.end}`,
    `Format: ${booking.format}`,
    `Language: ${booking.language}`,
    `Runtime: ${booking.runtime}`,
    `Seats:  ${seatText}`,
    `Paid:   £${parseFloat(booking.totalPaid).toFixed(2)}`,
  ];
  if (booking.membershipTier)   qrLines.push(`Membership Tier: ${booking.membershipTier}`);
  if (booking.membershipCode)   qrLines.push(`Membership Code: ${booking.membershipCode}`);

  new QRious({
    element: document.getElementById("qrCodeCanvas"),
    value: qrLines.join("\n"),
    size: 200,
  });
});
