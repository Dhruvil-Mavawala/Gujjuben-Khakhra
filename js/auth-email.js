// ─────────────────────────────────────────────────────────────────
//  auth-email.js  –  Email OTP Authentication
//
//  Handles the email entry step on /auth.
//
//  FLOW:
//    1. User enters email → submit
//    2. Try signIn.create({ strategy: "email_code", identifier: email })
//       → If account exists: sends OTP for sign-in
//    3. If account doesn't exist (form_identifier_not_found):
//       → signUp.create({ emailAddress: email })
//       → signUp.prepareEmailAddressVerification({ strategy: "email_code" })
//    4. Store { email, flow: "signIn"|"signUp" } in sessionStorage
//    5. Redirect to /otp
//
//  NOTE: Uses sessionStorage (not localStorage) for pending auth state.
//  sessionStorage is cleared when the tab closes — more secure for OTP flow.
// ─────────────────────────────────────────────────────────────────

// ── Firebase init ─────────────────────────────
const firebaseConfig = {
  apiKey           : "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain       : "khakhra-5cb3d.firebaseapp.com",
  databaseURL      : "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId        : "khakhra-5cb3d",
  storageBucket    : "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId            : "1:713999821089:web:f0c25da51cff322d61b660"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

// ── DOM refs ──────────────────────────────────
const emailForm   = document.getElementById("email-form");
const emailInput  = document.getElementById("auth-email");
const emailSubmit = document.getElementById("email-submit");
const errEmail    = document.getElementById("err-email");
const errForm     = document.getElementById("err-form");

// ── Redirect if already logged in ────────────
(async function checkSession() {
  try {
    const clerk = await window.clerkReady;
    if (clerk.user) {
      console.log("[Auth] Already signed in, redirecting to home.");
      window.location.replace("/");
    }
  } catch { /* not ready yet — fine */ }
})();

// ── Helpers ───────────────────────────────────
function setLoading(loading) {
  emailSubmit.disabled    = loading;
  emailSubmit.textContent = loading ? "Please wait…" : "Continue with Email";
}

function showErr(msg) {
  errForm.textContent = msg;
  errForm.className   = "form-msg";
}

function showSuccess(msg) {
  errForm.textContent = msg;
  errForm.className   = "form-msg success";
}

// ── Form submit ───────────────────────────────
emailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEmail.textContent = "";
  showErr("");

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
  emailInput.classList.remove("invalid");

  setLoading(true);

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    showErr("Authentication service unavailable. Please refresh.");
    setLoading(false);
    return;
  }

  // ── Try sign-in first (existing account) ─────
  try {
    console.log("[Auth] Attempting signIn for:", email);
    const signIn = await clerk.client.signIn.create({
      strategy  : "email_code",
      identifier: email,
    });

    console.log("[Auth] signIn created. status:", signIn.status);

    // Store pending sign-in state
    sessionStorage.setItem("pendingAuth", JSON.stringify({
      flow : "signIn",
      email: email,
    }));

    showSuccess("Code sent! Redirecting…");
    setTimeout(() => { window.location.href = "/otp"; }, 600);
    return;

  } catch (signInErr) {
    const code = signInErr?.errors?.[0]?.code;
    console.log("[Auth] signIn error code:", code);

    // Account doesn't exist → create new account
    if (code === "form_identifier_not_found" || code === "form_param_format_invalid") {
      console.log("[Auth] Account not found — creating new signUp.");
    } else {
      // Some other error (rate limit, network, etc.)
      const msg = signInErr?.errors?.[0]?.longMessage
               || signInErr?.errors?.[0]?.message
               || "Failed to send code. Please try again.";
      showErr(msg);
      setLoading(false);
      return;
    }
  }

  // ── Create new account (sign-up flow) ─────────
  try {
    console.log("[Auth] Creating signUp for:", email);
    const signUp = await clerk.client.signUp.create({
      emailAddress: email,
    });

    console.log("[Auth] signUp created. id:", signUp.id, "status:", signUp.status);

    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    console.log("[Auth] ✅ Verification email sent.");

    // Store pending sign-up state
    sessionStorage.setItem("pendingAuth", JSON.stringify({
      flow : "signUp",
      email: email,
    }));

    showSuccess("Code sent! Redirecting…");
    setTimeout(() => { window.location.href = "/otp"; }, 600);

  } catch (signUpErr) {
    console.error("[Auth] signUp error:", signUpErr);
    const msg = signUpErr?.errors?.[0]?.longMessage
             || signUpErr?.errors?.[0]?.message
             || "Failed to create account. Please try again.";
    showErr(msg);
    setLoading(false);
  }
});
