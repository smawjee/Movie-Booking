// join-membership.js

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const cards   = document.querySelectorAll(".tier-card");
    const joinBtn = document.getElementById("joinBtn");
    let selectedPlan = null;

    joinBtn.disabled = true;

    cards.forEach(card => {
      card.addEventListener("click", () => {
        cards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");

        selectedPlan = {
          tier:  card.dataset.tier,
          price: card.dataset.price
        };

        joinBtn.disabled     = false;
        joinBtn.textContent  = `Join ${selectedPlan.tier} for £${selectedPlan.price}/month`;
      });
    });

    joinBtn.addEventListener("click", () => {
      if (!selectedPlan) return;
      // save for later (payment page can pick it up)
      localStorage.setItem("selectedMembershipPlan", JSON.stringify(selectedPlan));
      // **NEW**: go to sign-up form first
      window.location.href = "join.html";
    });
  });
})();
