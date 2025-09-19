document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const rememberCheckbox = document.getElementById("rememberMe");
  const loginError = document.getElementById("loginError");

  // Pre-fill remembered email
  const rememberedEmail = localStorage.getItem("rememberedEmail");
  if (rememberedEmail && emailInput) {
    emailInput.value = rememberedEmail;
    rememberCheckbox.checked = true;
  }

  // Login submit
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loginError.style.display = "none";

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      const users = JSON.parse(localStorage.getItem("cinegoUsers")) || [];
      const userByEmail = users.find(u => u.email === email);

      if (!userByEmail) {
        loginError.textContent = "No account found with that email."; // email doesn't exist
        loginError.style.display = "block";
        return;
      }

      if (userByEmail.password !== password) {
        loginError.textContent = "Incorrect password."; // wrong password
        loginError.style.display = "block";
        return;
      }

      // success
      if (rememberCheckbox.checked) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      localStorage.setItem("loggedInUser", JSON.stringify(userByEmail));
      window.location.href = "index.html";
    });
  }

  // --- Simplified Forgot Password ---
  const forgotLink = document.getElementById("forgotPassword");
  const forgotModal = document.getElementById("forgotModal");
  const closeBtn = forgotModal.querySelector(".close");
  const resetEmailInput = document.getElementById("resetEmail");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const resetEmailError = document.getElementById("resetEmailError");
  const newPasswordError = document.getElementById("newPasswordError");
  const confirmPasswordError = document.getElementById("confirmPasswordError");
  const resetSubmitBtn = document.getElementById("resetSubmitBtn");
  const resetSuccess = document.getElementById("resetSuccess");

  function openModal() {
    forgotModal.classList.remove("hidden");
    resetEmailInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
    [resetEmailError, newPasswordError, confirmPasswordError].forEach(el => {
      el.textContent = "";
      el.style.display = "none";
    });
    resetSuccess.style.display = "none";
  }

  function closeModal() {
    forgotModal.classList.add("hidden");
  }

  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    openModal();
  });
  closeBtn.addEventListener("click", closeModal);
  forgotModal.addEventListener("click", (e) => {
    if (e.target === forgotModal) closeModal();
  });

  resetSubmitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Clear previous errors
    [resetEmailError, newPasswordError, confirmPasswordError].forEach(el => {
      el.textContent = "";
      el.style.display = "none";
    });
    resetSuccess.style.display = "none";

    const email = resetEmailInput.value.trim().toLowerCase();
    const newPass = newPasswordInput.value;
    const confirmPass = confirmPasswordInput.value;

    let valid = true;

    if (!email) {
      resetEmailError.textContent = "Email is required.";
      resetEmailError.style.display = "block";
      valid = false;
    }

    if (!newPass) {
      newPasswordError.textContent = "New password is required.";
      newPasswordError.style.display = "block";
      valid = false;
    } else if (newPass.length < 6) {
      newPasswordError.textContent = "Password must be at least 6 characters.";
      newPasswordError.style.display = "block";
      valid = false;
    }

    if (newPass !== confirmPass) {
      confirmPasswordError.textContent = "Passwords do not match.";
      confirmPasswordError.style.display = "block";
      valid = false;
    }

    if (!valid) return;

    const users = JSON.parse(localStorage.getItem("cinegoUsers")) || [];
    const idx = users.findIndex(u => u.email === email);
    if (idx === -1) {
      resetEmailError.textContent = "No account found with that email.";
      resetEmailError.style.display = "block";
      return;
    }

    // Update password
    users[idx].password = newPass;
    localStorage.setItem("cinegoUsers", JSON.stringify(users));

    // Provide success feedback
    resetSuccess.style.display = "block";

    // Optionally prefill login form
    emailInput.value = email;
    passwordInput.value = newPass;

    // Close modal after a short delay
    setTimeout(() => {
      closeModal();
    }, 1200);
  });
});
