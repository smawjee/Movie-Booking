// paymentModal.js

// Inject CSS for Apply button (unchanged)
const style = document.createElement("style");
style.textContent = `
  #applyDiscountBtn {
    padding: 8px 16px;
    background-color: #222;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s, transform 0.2s;
  }
  #applyDiscountBtn:hover {
    background-color: #444;
    transform: translateY(-1px);
  }
  #applyDiscountBtn:active {
    background-color: #000;
    transform: scale(0.98);
  }
  #applyDiscountBtn.applied {
    background-color: #28a745 !important;
  }
  #applyDiscountBtn.invalid {
    background-color: #dc3545 !important;
  }
`;
document.head.appendChild(style);

// Show payment modal with reset values
export function showPaymentModal(totalPrice) {
  const modal         = document.getElementById("paymentModal");
  const modalTotal    = document.getElementById("modalTotalPrice");
  const modalDiscount = document.getElementById("modalDiscountAmount");
  const modalNewTotal = document.getElementById("modalDiscountedPrice");

  document.getElementById("discountInfo").style.display      = "none";
  document.getElementById("finalTotalWrapper").style.display = "none";

  modalTotal.textContent    = parseFloat(totalPrice).toFixed(2);
  modalDiscount.textContent = "0.00";
  modalNewTotal.textContent = parseFloat(totalPrice).toFixed(2);

  // Reset inputs
  ["cardNumber", "expiry", "cvv", "memberCode"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const applyBtn = document.getElementById("applyDiscountBtn");
  if (applyBtn) {
    applyBtn.textContent = "Apply";
    applyBtn.classList.remove("applied", "invalid");
  }

  modal.style.display = "block";

  // — Auto-fill membership and card details for logged-in user —
  try {
    const userObj = JSON.parse(localStorage.getItem("loggedInUser") || "{}");
    if (userObj.email) {
      const users = JSON.parse(localStorage.getItem("cinegoUsers") || "[]");
      const me    = users.find(u => u.email === userObj.email);
      if (me && me.membershipId) {
        // Fill in membership code
        const codeInput = document.getElementById("memberCode");
        codeInput.value = me.membershipId;

        // Autofill stored card info from membership payment
        if (me.cardNumber && me.expiry && me.cvv) {
          document.getElementById("cardNumber").value = me.cardNumber;
          document.getElementById("expiry").value     = me.expiry;
          document.getElementById("cvv").value        = me.cvv;
        }

        // Auto-apply membership discount
        setTimeout(() => applyMembershipDiscount(), 0);
      }
    }
  } catch (e) {
    console.warn("Auto-fill from membership failed:", e);
  }
}

// Close modal
export function closeModal() {
  document.getElementById("paymentModal").style.display = "none";
}

// Apply membership discount
export function applyMembershipDiscount() {
  const codeInput = document.getElementById("memberCode");
  const code      = codeInput.value.trim().toUpperCase();
  const total     = parseFloat(
    document.getElementById("modalTotalPrice").textContent
  );
  const applyBtn  = document.getElementById("applyDiscountBtn");

  // Look up user by membershipId
  const users  = JSON.parse(localStorage.getItem("cinegoUsers")) || [];
  const member = users.find(u => u.membershipId.toUpperCase() === code);

  const isValid = Boolean(member);
  let discountRate = 0;

  // Determine rate by tier
  if (isValid) {
    switch (member.membershipTier) {
      case "Silver":   discountRate = 0.05; break;
      case "Gold":     discountRate = 0.10; break;
      case "Platinum": discountRate = 0.15; break;
      default:         discountRate = 0;
    }
  }

  const discountAmount = (total * discountRate).toFixed(2);
  const newTotal       = (total - discountAmount).toFixed(2);

  // Update UI
  document.getElementById("modalDiscountAmount").textContent   = discountAmount;
  document.getElementById("modalDiscountedPrice").textContent = newTotal;
  document.getElementById("discountInfo").style.display       = isValid ? "block" : "none";
  document.getElementById("finalTotalWrapper").style.display  = isValid ? "block" : "none";

  if (applyBtn) {
    applyBtn.classList.remove("applied", "invalid");
    applyBtn.textContent = isValid ? `✓ ${member.membershipTier} Applied` : "Invalid Code";
    applyBtn.classList.add(isValid ? "applied" : "invalid");

    if (!isValid) {
      setTimeout(() => {
        applyBtn.textContent = "Apply";
        applyBtn.classList.remove("invalid");
      }, 1500);
      alert("Invalid membership code. Please use your assigned ID.");
    }
  }
}

// Confirm and store booking
export function confirmPayment() {
  // Validate payment inputs
  const card   = document.getElementById("cardNumber").value.trim();
  const expiry = document.getElementById("expiry").value.trim();
  const cvv    = document.getElementById("cvv").value.trim();
  if (!card || !expiry || !cvv) {
    alert("Please fill out all payment fields.");
    return;
  }

  // Compute final paid amount
  const totalPaidRaw = 
    document.getElementById("modalDiscountedPrice").textContent ||
    document.getElementById("modalTotalPrice").textContent;
  const totalPaid = parseFloat(totalPaidRaw).toFixed(2);

  // Read membership code & tier
  const memberCode = document.getElementById("memberCode").value.trim().toUpperCase();
  const users      = JSON.parse(localStorage.getItem("cinegoUsers")) || [];
  const member     = users.find(u => u.membershipId.toUpperCase() === memberCode);
  const membershipTier = member?.membershipTier || "";

  // Read language & runtime
  let language = localStorage.getItem("tempLanguage") || "Unknown";
  let runtime  = localStorage.getItem("tempRuntime")  || "N/A";
  const langEl = document.getElementById("language");
  const runEl  = document.getElementById("runtime");
  if (langEl && langEl.textContent.trim()) language = langEl.textContent.trim();
  if (runEl  && runEl.textContent.trim())  runtime  = runEl.textContent.trim();

  // Get current user
  const userObj   = JSON.parse(localStorage.getItem("loggedInUser")) || {};
  const userEmail = userObj.email || "Guest";

  // Build booking object
  const booking = {
    user:           userEmail,
    movie:          localStorage.getItem("tempMovieTitle")   || "Unknown",
    poster:         localStorage.getItem("tempMoviePoster")  || "",
    screen:         localStorage.getItem("tempScreen")       || "",
    start:          localStorage.getItem("tempStart")        || "",
    end:            localStorage.getItem("tempEnd")          || "",
    format:         localStorage.getItem("tempFormat")       || "",
    rating:         localStorage.getItem("tempRating")       || "",
    date:           localStorage.getItem("tempBookingDate")  || "",
    seats:          JSON.parse(localStorage.getItem("tempSelectedSeats") || "[]"),
    language,
    runtime,
    totalPaid,
    membershipCode: memberCode,
    membershipTier,
    timestamp:      new Date().toISOString(),
  };

  // Save booking
  const bookings = JSON.parse(localStorage.getItem("cinegoBookings") || "[]");
  bookings.push(booking);
  localStorage.setItem("cinegoBookings", JSON.stringify(bookings));
  localStorage.setItem("lastBooking",    JSON.stringify(booking));

  // Clear temp values
  Object.keys(localStorage)
    .filter(key => key.startsWith("temp"))
    .forEach(key => localStorage.removeItem(key));

  closeModal();
  window.location.href = "confirmation.html";
}
