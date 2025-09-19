// join.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("joinForm");

  // 0️⃣ Ensure a plan was selected on the prior page
  const planJson = localStorage.getItem("selectedMembershipPlan");
  if (!planJson) {
    alert("Please select a membership plan first.");
    window.location.href = "join-membership.html";
    return;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();

    // 1️⃣ Gather & trim inputs
    const firstName       = form.firstName.value.trim();
    const surname         = form.surname.value.trim();
    const email           = form.email.value.trim().toLowerCase();
    const password        = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const location        = form.location.value;
    const dobDay          = form.dobDay.value.trim().padStart(2, "0");
    const dobMonth        = form.dobMonth.value.trim().padStart(2, "0");
    const dobYear         = form.dobYear.value.trim();
    const marketing       = form.marketing.checked;
    const dob             = `${dobDay}/${dobMonth}/${dobYear}`;

    // 2️⃣ Basic validation
    if (!firstName || !surname || !email ||
        !password || !confirmPassword ||
        !location || !dobDay || !dobMonth || !dobYear) {
      alert("Please fill in all required fields.");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      alert("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
      return;
    }

    // 3️⃣ Check for duplicate email
    let users = JSON.parse(localStorage.getItem("cinegoUsers")) || [];
    if (users.some(u => u.email === email)) {
      alert("An account with this email already exists.");
      return;
    }

    // 4️⃣ Extract chosen tier from plan selection
    const { tier, price } = JSON.parse(planJson);

    // 5️⃣ Temporarily store the profile (no membership ID yet)
    const tempProfile = {
      firstName,
      surname,
      email,
      password,
      location,
      dob,
      marketing,
      membershipTier: tier
    };
    localStorage.setItem("tempUserProfile", JSON.stringify(tempProfile));

    // 6️⃣ Redirect to payment page for that tier
    window.location.href = "join-membership-payment.html";
  });
});
