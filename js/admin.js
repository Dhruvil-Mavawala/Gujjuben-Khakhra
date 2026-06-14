document.addEventListener("DOMContentLoaded", function () {
  const emailInput    = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailError    = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const loginBtn      = document.getElementById("login-btn");
  const eyeToggle     = document.getElementById("eye-toggle");

  // ── Password visibility toggle ──────────────────────────────────────────────
  eyeToggle.addEventListener("click", function () {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    eyeToggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");

    // Swap icon stroke to indicate state
    const icon = document.getElementById("eye-icon");
    icon.style.opacity = isHidden ? "1" : "0.4";
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    let valid = true;

    const email    = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Email
    if (!email) {
      emailError.textContent = "Email is required.";
      emailInput.classList.add("error");
      valid = false;
    } else if (!emailRegex.test(email)) {
      emailError.textContent = "Enter a valid email address.";
      emailInput.classList.add("error");
      valid = false;
    } else {
      emailError.textContent = "";
      emailInput.classList.remove("error");
    }

    // Password
    if (!password) {
      passwordError.textContent = "Password is required.";
      passwordInput.classList.add("error");
      valid = false;
    } else {
      passwordError.textContent = "";
      passwordInput.classList.remove("error");
    }

    return valid;
  }

  // ── Login click ─────────────────────────────────────────────────────────────
  loginBtn.addEventListener("click", function () {
    if (!validate()) return;

    const inputEmail    = emailInput.value.trim();
    const inputPassword = passwordInput.value.trim();

    loginBtn.disabled    = true;
    loginBtn.textContent = "Checking...";

    db.ref("admin").once("value")
      .then(snapshot => {
        if (!snapshot.exists()) {
          showCredentialError();
          return;
        }

        let matched = false;

        snapshot.forEach(child => {
          const { email, password } = child.val();
          if (email === inputEmail && password === inputPassword) {
            matched = true;
          }
        });

        if (matched) {
          // Set auth state before redirecting
          // Store adminEmail so auth.js can verify role in Firebase
          localStorage.setItem("isAdminLoggedIn", "true");
          localStorage.setItem("role", "admin");
          localStorage.setItem("adminEmail", inputEmail);
          window.location.replace("/dashboard");
        } else {
          showCredentialError();
        }
      })
      .catch(err => {
        console.error("Firebase error:", err);
        showCredentialError("Something went wrong. Please try again.");
      })
      .finally(() => {
        loginBtn.disabled    = false;
        loginBtn.textContent = "LOG IN";
      });
  });

  function showCredentialError(msg) {
    passwordError.textContent = msg || "Invalid email or password.";
    emailInput.classList.add("error");
    passwordInput.classList.add("error");
  }

  // Clear errors on input
  emailInput.addEventListener("input", function () {
    emailError.textContent = "";
    emailInput.classList.remove("error");
  });

  passwordInput.addEventListener("input", function () {
    passwordError.textContent = "";
    passwordInput.classList.remove("error");
  });
});
