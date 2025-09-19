// auth.js

document.addEventListener("DOMContentLoaded", () => {
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const navAuth      = document.querySelector(".nav-auth");
  if (!loggedInUser || !navAuth) return;

  // Fallback if somehow missing:
  const membershipTier = loggedInUser.membershipTier || "Standard";

  navAuth.innerHTML = `
    <div class="user-dropdown">
      <button class="user-btn">
        Welcome, ${loggedInUser.firstName} <i class="fas fa-caret-down"></i>
      </button>
      <div class="user-menu">
        <span class="membership-tier">Tier: ${membershipTier}</span>
        <span class="membership-id">ID: ${loggedInUser.membershipId}</span>
        <a href="manage-bookings.html">Manage Bookings</a>
        <a href="#" id="logoutBtn">Sign Out</a>
      </div>
    </div>
  `;

  const dropdown = navAuth.querySelector(".user-dropdown");
  const userBtn  = dropdown.querySelector(".user-btn");

  userBtn.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });
  document.addEventListener("click", () => dropdown.classList.remove("open"));
  document.getElementById("logoutBtn")
          .addEventListener("click", () => {
            localStorage.removeItem("loggedInUser");
            window.location.href = "index.html";
          });
});
