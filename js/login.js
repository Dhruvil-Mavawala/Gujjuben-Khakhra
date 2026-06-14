// ─────────────────────────────────────────────────────────────────
//  login.js  –  Email OTP + Google Authentication
//
//  EMAIL FLOW:
//    1. User enters email → submit
//    2. Try signIn.create({ strategy: "email_code", identifier: email })
//       → account exists: OTP sent for sign-in
//    3. If account not found → signUp.create({ emailAddress: email })
//       → prepareEmailAddressVerification({ strategy: "email_code" })
//    4. Store { email, flow } in sessionStorage
//    5. Redirect to /otp
//
//  GOOGLE FLOW:
//    authenticateWithRedirect → /sso-callback → /
//
//  SECURITY: No passwords. No usernames. No phone numbers.
// ─────────────────────────────────────────────────────────────────

// ── Firebase init ─────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain: "khakhra-5cb3d.firebaseapp.com",
  databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId: "khakhra-5cb3d",
  storageBucket: "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId: "1:713999821089:web:f0c25da51cff322d61b660",
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

// ── DOM refs ──────────────────────────────────
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const loginSubmit = document.getElementById("login-submit");
const errEmail = document.getElementById("err-email");
const errForm = document.getElementById("err-form");
const googleBtn = document.getElementById("google-btn");

// ── Redirect if already signed in ────────────
(async function checkExistingSession() {
  try {
    const clerk = await window.clerkReady;
    if (clerk.user) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      const target =
        redirect && /^\/[a-zA-Z0-9_\-]*$/.test(redirect)
          ? redirect
          : "/";
      window.location.replace(target);
    }
  } catch {
    /* Clerk not ready — fine, let user log in */
  }
})();

// ── Helpers ───────────────────────────────────
function setEmailLoading(loading) {
  loginSubmit.disabled = loading;
  loginSubmit.textContent = loading ? "Please wait…" : "Continue with Email";
}

function showErr(msg) {
  errForm.textContent = msg;
  errForm.className = "form-msg";
}

function showSuccess(msg) {
  errForm.textContent = msg;
  errForm.className = "form-msg success";
}

function clearErrors() {
  errEmail.textContent = "";
  errForm.textContent = "";
  errForm.className = "form-msg";
  emailInput.classList.remove("invalid");
}

// ── Email form submit ─────────────────────────
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const email = emailInput.value.trim().toLowerCase();

  if (!email) {
    errEmail.textContent = "Email is required.";
    emailInput.classList.add("invalid");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEmail.textContent = "Enter a valid email address.";
    emailInput.classList.add("invalid");
    return;
  }

  setEmailLoading(true);

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    showErr("Authentication service unavailable. Please refresh.");
    setEmailLoading(false);
    return;
  }

  // ── Try sign-in first (existing account) ─────
  try {
    await clerk.client.signIn.create({
      strategy: "email_code",
      identifier: email,
    });

    // OTP sent for sign-in
    sessionStorage.setItem(
      "pendingAuth",
      JSON.stringify({ flow: "signIn", email }),
    );
    showSuccess("Code sent! Redirecting…");
    setTimeout(() => {
      window.location.href = "/otp";
    }, 600);
    return;
  } catch (signInErr) {
    const code = signInErr?.errors?.[0]?.code;

    if (code === "form_identifier_not_found") {
      // Account doesn't exist — fall through to sign-up
    } else {
      // Real error (rate limit, network, etc.)
      showErr(
        signInErr?.errors?.[0]?.longMessage ||
        signInErr?.errors?.[0]?.message ||
        "Failed to send code. Please try again.",
      );
      setEmailLoading(false);
      return;
    }
  }

  // ── Create new account (sign-up) ──────────────
  try {
    const signUp = await clerk.client.signUp.create({ emailAddress: email });
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

    sessionStorage.setItem(
      "pendingAuth",
      JSON.stringify({ flow: "signUp", email }),
    );
    showSuccess("Code sent! Redirecting…");
    setTimeout(() => {
      window.location.href = "/otp";
    }, 600);
  } catch (signUpErr) {
    showErr(
      signUpErr?.errors?.[0]?.longMessage ||
      signUpErr?.errors?.[0]?.message ||
      "Failed to create account. Please try again.",
    );
    setEmailLoading(false);
  }
});

// ── Google button ─────────────────────────────
googleBtn.addEventListener("click", async () => {
  googleBtn.disabled = true;
  googleBtn.textContent = "Connecting…";

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    googleBtn.disabled = false;
    googleBtn.textContent = "Continue with Google";
    showErr("Authentication service unavailable. Please refresh.");
    return;
  }

  try {
    // Use origin-relative callback — no extra path prefixes
    const callbackUrl = window.location.origin + "/sso-callback";

    await clerk.client.signIn.authenticateWithRedirect({
      strategy           : "oauth_google",
      redirectUrl        : callbackUrl,
      redirectUrlComplete: callbackUrl,
    });
    // Page redirects — nothing runs after this
  } catch (err) {
    console.error("[Google] OAuth error:", err);
    googleBtn.disabled = false;
    googleBtn.textContent = "Continue with Google";
    showErr(
      err?.errors?.[0]?.message || "Google sign-in failed. Please try again.",
    );
  }
});
