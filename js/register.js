// ─────────────────────────────────────────────────────────────────
//  register.js  –  Gujju Khakhra Registration
//
//  COMPLETE FLOW (single-page — no navigation between steps):
//    STEP 1: Form → validate → signUp.create() → prepareEmailVerification()
//    STEP 2: OTP panel (same page) → attemptEmailVerification()
//            → handle missing_requirements → setActive() → Firebase → redirect
//
//  KEY FIX: signUp.create() now passes `username` (not firstName).
//  KEY FIX: after verification, if status === "missing_requirements",
//           call signUp.update() with missingFields before completing.
// ─────────────────────────────────────────────────────────────────

// ── Firebase ──────────────────────────────────
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
const db = firebase.database();

// ── Module state ──────────────────────────────
let activeSignUp     = null;   // live Clerk SignUp object — set in Step 1
let pendingProfile   = null;   // { username, email, phone }
let otpTimerInterval = null;

// ── DOM refs ──────────────────────────────────
const form      = document.getElementById("register-form");
const submitBtn = document.getElementById("reg-submit");

const fields = {
  username : document.getElementById("reg-username"),
  email    : document.getElementById("reg-email"),
  phone    : document.getElementById("reg-phone"),
  password : document.getElementById("reg-password"),
  confirm  : document.getElementById("reg-confirm"),
};

const errors = {
  username : document.getElementById("err-username"),
  email    : document.getElementById("err-email"),
  phone    : document.getElementById("err-phone"),
  password : document.getElementById("err-password"),
  confirm  : document.getElementById("err-confirm"),
  form     : document.getElementById("err-form"),
};

// OTP panel refs (populated by showOtpPanel)
let otpBoxes     = [];
let otpVerifyBtn = null;
let otpResendBtn = null;
let otpMsg       = null;
let otpCountdown = null;

// ── Eye toggles ───────────────────────────────
document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    input.type  = input.type === "password" ? "text" : "password";
    btn.textContent = input.type === "password" ? "👁" : "🙈";
  });
});

// ── Password strength ─────────────────────────
const strengthBar   = document.getElementById("strength-bar");
const strengthLabel = document.getElementById("strength-label");

fields.password.addEventListener("input", () => {
  const pw = fields.password.value;
  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[a-z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { pct: "0%",   color: "transparent", label: "" },
    { pct: "20%",  color: "#e53935",     label: "Very Weak" },
    { pct: "40%",  color: "#ff7043",     label: "Weak" },
    { pct: "60%",  color: "#ffa726",     label: "Fair" },
    { pct: "80%",  color: "#66bb6a",     label: "Strong" },
    { pct: "100%", color: "#43a047",     label: "Very Strong" },
  ];
  const lvl = levels[score];
  strengthBar.style.width      = lvl.pct;
  strengthBar.style.background = lvl.color;
  strengthLabel.textContent    = lvl.label;
});

// ── Error helpers ─────────────────────────────
function showError(field, msg) {
  errors[field].textContent = msg;
  if (fields[field]) { fields[field].classList.add("invalid"); fields[field].classList.remove("valid"); }
}
function clearError(field) {
  errors[field].textContent = "";
  if (fields[field]) { fields[field].classList.remove("invalid"); fields[field].classList.add("valid"); }
}
function resetAll() {
  Object.keys(errors).forEach(k => {
    errors[k].textContent = "";
    errors[k].style.color = "";
    if (fields[k]) fields[k].classList.remove("invalid", "valid");
  });
}
function setFormMsg(msg, ok = false) {
  errors.form.textContent = msg;
  errors.form.style.color = ok ? "#2e7d32" : "";
}
function setLoading(loading, label = "Create Account") {
  submitBtn.disabled    = loading;
  submitBtn.textContent = loading ? "Please wait…" : label;
}

// ── Validation ────────────────────────────────
function validate(username, email, phone, password, confirm) {
  let ok = true;
  if (!username)           { showError("username", "Username is required."); ok = false; }
  else if (username.length < 3) { showError("username", "Username must be at least 3 characters."); ok = false; }
  else                     { clearError("username"); }

  if (!email)              { showError("email", "Email is required."); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("email", "Enter a valid email address."); ok = false; }
  else                     { clearError("email"); }

  if (!phone)              { showError("phone", "Phone number is required."); ok = false; }
  else if (!/^\d{10}$/.test(phone)) { showError("phone", "Phone must be exactly 10 digits."); ok = false; }
  else                     { clearError("phone"); }

  const pwChecks = [
    { re: /.{8,}/,        msg: "at least 8 characters" },
    { re: /[A-Z]/,        msg: "one uppercase letter" },
    { re: /[a-z]/,        msg: "one lowercase letter" },
    { re: /[0-9]/,        msg: "one number" },
    { re: /[^A-Za-z0-9]/, msg: "one special character" },
  ];
  const failed = pwChecks.filter(c => !c.re.test(password));
  if (!password)           { showError("password", "Password is required."); ok = false; }
  else if (failed.length)  { showError("password", "Password needs: " + failed.map(c => c.msg).join(", ") + "."); ok = false; }
  else                     { clearError("password"); }

  if (!confirm)            { showError("confirm", "Please confirm your password."); ok = false; }
  else if (confirm !== password) { showError("confirm", "Passwords do not match."); ok = false; }
  else                     { clearError("confirm"); }

  return ok;
}

// ── Clerk error → message ─────────────────────
function clerkErrMsg(err) {
  const e = err?.errors?.[0];
  if (!e) return err?.message || "Registration failed. Please try again.";
  switch (e.code) {
    case "form_identifier_exists": return "This email is already registered. Try logging in instead.";
    case "form_password_pwned":    return "This password appeared in a data breach. Please choose a different one.";
    case "form_password_length_too_short": return "Password must be at least 8 characters.";
    default: return e.longMessage || e.message || "Registration failed. Please try again.";
  }
}

// ─────────────────────────────────────────────
//  CORE: Complete signup after verification
//  Called when signUp.status === "complete"
// ─────────────────────────────────────────────
async function finalizeSignUp(clerk, signUp) {
  console.log("[Finalize] createdSessionId:", signUp.createdSessionId);
  console.log("[Finalize] createdUserId:", signUp.createdUserId);

  // Activate the Clerk session
  if (signUp.createdSessionId) {
    await clerk.setActive({ session: signUp.createdSessionId });
    console.log("[Finalize] ✅ Session activated. clerk.user.id:", clerk.user?.id);
  } else {
    console.warn("[Finalize] No createdSessionId on signUp — session may already be active.");
  }

  // Get the Clerk user ID
  const uid = signUp.createdUserId || clerk.user?.id;
  console.log("[Finalize] uid:", uid);

  if (!uid) {
    throw new Error("Clerk user ID unavailable after session activation.");
  }

  // Save to Firebase (idempotent)
  const existing = await db.ref(`users/${uid}`).once("value");
  if (!existing.exists()) {
    const payload = {
      uid,
      username : pendingProfile.username,
      email    : pendingProfile.email,
      phone    : pendingProfile.phone,
      role     : "customer",
      provider : "clerk",
      createdAt: new Date().toISOString(),
    };
    console.log("[Firebase] Writing:", payload);
    await db.ref(`users/${uid}`).set(payload);
    console.log("[Firebase] ✅ Saved.");
  } else {
    console.log("[Firebase] User already exists — skipping write.");
  }

  // Store localStorage session
  const session = {
    id      : uid,
    username: pendingProfile.username,
    email   : pendingProfile.email,
    phone   : pendingProfile.phone,
    role    : "customer",
  };
  localStorage.setItem("user", JSON.stringify(session));
  console.log("[Session] ✅ Stored:", session);

  // Clean up
  localStorage.removeItem("pendingRegistration");
  activeSignUp   = null;
  pendingProfile = null;

  showOtpMsg("Account created! Redirecting…", true);
  console.log("[Finalize] ✅ Done. Redirecting.");
  setTimeout(() => { window.location.href = "/"; }, 1200);
}

// ─────────────────────────────────────────────
//  CORE: Handle signUp after attempt
//  Resolves missing_requirements by calling update()
// ─────────────────────────────────────────────
async function resolveSignUp(clerk, signUp) {
  console.log("[Resolve] signUp.status:", signUp.status);
  console.log("[Resolve] missingFields:", signUp.missingFields);
  console.log("[Resolve] unverifiedFields:", signUp.unverifiedFields);
  console.log("[Resolve] requiredFields:", signUp.requiredFields);

  if (signUp.status === "complete") {
    await finalizeSignUp(clerk, signUp);
    return;
  }

  if (signUp.status === "missing_requirements") {
    const missing = signUp.missingFields || [];
    console.log("[Resolve] Missing fields to supply:", missing);

    if (missing.length === 0) {
      // All fields supplied but something else is unverified
      // This shouldn't happen after email verification — log and surface error
      console.error("[Resolve] missing_requirements but no missingFields. unverifiedFields:", signUp.unverifiedFields);
      showOtpMsg("Verification incomplete. Please try again or contact support.");
      setOtpLoading(false);
      return;
    }

    // Build update payload from missingFields
    const updatePayload = {};
    for (const field of missing) {
      switch (field) {
        case "username":
          updatePayload.username = pendingProfile.username;
          break;
        case "first_name":
        case "firstName":
          updatePayload.firstName = pendingProfile.username;
          break;
        case "last_name":
        case "lastName":
          updatePayload.lastName = "";
          break;
        // Add more cases if your Clerk dashboard requires other fields
        default:
          console.warn("[Resolve] Unknown missing field:", field);
      }
    }

    console.log("[Resolve] Calling signUp.update() with:", updatePayload);
    let updated;
    try {
      updated = await signUp.update(updatePayload);
    } catch (err) {
      console.error("[Resolve] signUp.update() failed:", err);
      showOtpMsg("Account setup failed. Please try again.");
      setOtpLoading(false);
      return;
    }

    console.log("[Resolve] After update — status:", updated.status, "missingFields:", updated.missingFields);

    if (updated.status === "complete") {
      await finalizeSignUp(clerk, updated);
    } else {
      console.error("[Resolve] Still not complete after update. status:", updated.status, "missingFields:", updated.missingFields);
      showOtpMsg("Account setup incomplete. Please contact support.");
      setOtpLoading(false);
    }
    return;
  }

  if (signUp.status === "abandoned") {
    showOtpMsg("Registration session expired (24h). Please register again.");
    setOtpLoading(false);
    setTimeout(() => { window.location.href = "/login"; }, 2500);
    return;
  }

  // Unknown status
  console.error("[Resolve] Unexpected signUp.status:", signUp.status);
  showOtpMsg("Unexpected error. Please try again.");
  setOtpLoading(false);
}

// ─────────────────────────────────────────────
//  STEP 2 — OTP Panel
// ─────────────────────────────────────────────
function showOtpPanel(email) {
  // Hide the registration form card
  const authCard = document.querySelector(".auth-card");
  if (authCard) authCard.style.display = "none";

  // Inject OTP panel into the same auth-form-panel
  const panel = document.createElement("div");
  panel.id        = "otp-panel";
  panel.className = "auth-card";
  panel.innerHTML = `
    <img src="assets/images/union0.svg" alt="Logo"
         style="height:48px;margin:0 auto 16px;display:block;" />
    <h2 class="auth-card-title">Verify Your Email ✉️</h2>
    <p class="auth-card-sub">
      Enter the 6-digit code sent to <strong>${maskEmail(email)}</strong>
    </p>

    <div id="otp-inputs-reg"
         style="display:flex;gap:8px;justify-content:center;margin:20px 0;">
      ${[0,1,2,3,4,5].map(i => `
        <input class="otp-box-reg" type="text" inputmode="numeric"
               maxlength="1" data-index="${i}" aria-label="Code digit ${i+1}"
               style="width:44px;height:52px;text-align:center;font-size:22px;
                      font-weight:700;border:2px solid #dee2e6;border-radius:10px;
                      outline:none;transition:border-color .2s;" />`
      ).join("")}
    </div>

    <p id="otp-timer-reg"
       style="text-align:center;font-size:13px;color:#888;margin-bottom:8px;">
      Resend code in <span id="otp-countdown-reg">30</span>s
    </p>

    <p id="otp-msg-reg"
       style="text-align:center;font-size:13px;min-height:20px;margin-bottom:12px;"></p>

    <button id="otp-verify-btn-reg" class="auth-btn" disabled
            style="width:100%;margin-bottom:10px;">Verify Code</button>

    <button id="otp-resend-btn-reg" class="auth-btn" disabled
            style="width:100%;background:#f1f3f5;color:#333;box-shadow:none;">
      Resend Code
    </button>

    <p style="text-align:center;margin-top:16px;font-size:13px;">
      <a href="/login" style="color:#0b8f3c;">← Back</a>
    </p>
  `;

  const formPanel = document.querySelector(".auth-form-panel") || document.body;
  formPanel.appendChild(panel);

  otpBoxes     = Array.from(panel.querySelectorAll(".otp-box-reg"));
  otpVerifyBtn = panel.querySelector("#otp-verify-btn-reg");
  otpResendBtn = panel.querySelector("#otp-resend-btn-reg");
  otpMsg       = panel.querySelector("#otp-msg-reg");
  otpCountdown = panel.querySelector("#otp-countdown-reg");

  wireOtpBoxes();
  startOtpTimer(30);
  otpVerifyBtn.addEventListener("click", handleOtpVerify);
  otpResendBtn.addEventListener("click", handleOtpResend);
  otpBoxes[0]?.focus();
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "****@" + domain;
}

function wireOtpBoxes() {
  otpBoxes.forEach((box, i) => {
    box.addEventListener("keydown", (e) => {
      if (!/^\d$/.test(e.key) &&
          !["Backspace","Delete","Tab","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    });
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      box.value = val ? val[0] : "";
      box.style.borderColor = box.value ? "#0b8f3c" : "#dee2e6";
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
      checkOtpFilled();
    });
    box.addEventListener("keyup", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) otpBoxes[i - 1].focus();
    });
    box.addEventListener("click", () => box.select());
  });

  document.getElementById("otp-inputs-reg")?.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData)
      .getData("text").replace(/\D/g, "").slice(0, 6);
    pasted.split("").forEach((d, i) => {
      if (otpBoxes[i]) { otpBoxes[i].value = d; otpBoxes[i].style.borderColor = "#0b8f3c"; }
    });
    otpBoxes[Math.min(pasted.length, 5)]?.focus();
    checkOtpFilled();
  });
}

function checkOtpFilled() {
  if (otpVerifyBtn) otpVerifyBtn.disabled = !otpBoxes.every(b => b.value.length === 1);
}
function getOtpCode() { return otpBoxes.map(b => b.value).join(""); }
function showOtpMsg(text, ok = false) {
  if (!otpMsg) return;
  otpMsg.textContent = text;
  otpMsg.style.color = ok ? "#2e7d32" : "#e53935";
}
function setOtpLoading(loading) {
  if (!otpVerifyBtn) return;
  otpVerifyBtn.disabled    = loading;
  otpVerifyBtn.textContent = loading ? "Verifying…" : "Verify Code";
}
function startOtpTimer(seconds = 30) {
  clearInterval(otpTimerInterval);
  if (otpResendBtn) otpResendBtn.disabled = true;
  const timerEl = document.getElementById("otp-timer-reg");
  if (timerEl) timerEl.style.display = "block";
  if (otpCountdown) otpCountdown.textContent = seconds;

  otpTimerInterval = setInterval(() => {
    seconds--;
    if (otpCountdown) otpCountdown.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(otpTimerInterval);
      if (timerEl) timerEl.style.display = "none";
      if (otpResendBtn) otpResendBtn.disabled = false;
    }
  }, 1000);
}

// ── OTP verify ────────────────────────────────
async function handleOtpVerify() {
  const code = getOtpCode();
  if (code.length !== 6) return;

  setOtpLoading(true);
  showOtpMsg("");

  console.log("[OTP] code:", code);
  console.log("[OTP] activeSignUp.id:", activeSignUp?.id);
  console.log("[OTP] activeSignUp.status:", activeSignUp?.status);
  console.log("[OTP] activeSignUp.emailAddress:", activeSignUp?.emailAddress);
  console.log("[OTP] activeSignUp.missingFields:", activeSignUp?.missingFields);

  if (!activeSignUp) {
    showOtpMsg("Registration session lost. Please go back and register again.");
    setOtpLoading(false);
    return;
  }

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    showOtpMsg("Authentication service unavailable. Please refresh.");
    setOtpLoading(false);
    return;
  }

  try {
    console.log("[OTP] Calling attemptEmailAddressVerification...");
    const result = await activeSignUp.attemptEmailAddressVerification({ code });

    console.log("[OTP] result.status:", result.status);
    console.log("[OTP] result.createdSessionId:", result.createdSessionId);
    console.log("[OTP] result.createdUserId:", result.createdUserId);
    console.log("[OTP] result.missingFields:", result.missingFields);

    showOtpMsg("Email verified! Setting up your account…", true);
    await resolveSignUp(clerk, result);

  } catch (err) {
    console.error("[OTP] Error:", err);
    const e = err?.errors?.[0];
    const code = e?.code;
    console.log("[OTP] Clerk error code:", code);

    if (code === "form_code_incorrect") {
      showOtpMsg("Incorrect code. Please check your email and try again.");
    } else if (code === "verification_expired") {
      showOtpMsg("Code expired. Click Resend to get a new one.");
    } else if (code === "verification_already_verified") {
      // Email already verified — signUp may already be complete or missing_requirements
      console.log("[OTP] Already verified — resolving signUp state.");
      showOtpMsg("Email already verified. Setting up your account…", true);
      try {
        await resolveSignUp(clerk, activeSignUp);
      } catch (resolveErr) {
        console.error("[OTP] resolveSignUp after already_verified failed:", resolveErr);
        showOtpMsg("Account setup failed. Please try logging in instead.");
        setOtpLoading(false);
      }
    } else {
      showOtpMsg(e?.longMessage || e?.message || "Verification failed. Please try again.");
      setOtpLoading(false);
    }
  }
}

// ── OTP resend ────────────────────────────────
async function handleOtpResend() {
  if (otpResendBtn) otpResendBtn.disabled = true;
  showOtpMsg("");

  if (!activeSignUp) {
    showOtpMsg("Registration session lost. Please go back and register again.");
    if (otpResendBtn) otpResendBtn.disabled = false;
    return;
  }

  try {
    // Resending invalidates the previous code — only the new code will work
    await activeSignUp.prepareEmailAddressVerification({ strategy: "email_code" });
    otpBoxes.forEach(b => { b.value = ""; b.style.borderColor = "#dee2e6"; });
    otpBoxes[0]?.focus();
    if (otpVerifyBtn) otpVerifyBtn.disabled = true;
    showOtpMsg("New code sent to your email.", true);
    startOtpTimer(30);
    console.log("[Resend] ✅ New code sent. Previous code is now invalid.");
  } catch (err) {
    console.error("[Resend] Error:", err);
    showOtpMsg("Failed to resend. Please try again.");
    if (otpResendBtn) otpResendBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────
//  STEP 1 — Registration Form
// ─────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resetAll();

  const username = fields.username.value.trim();
  const email    = fields.email.value.trim().toLowerCase();
  const phone    = fields.phone.value.replace(/\D/g, "");
  const password = fields.password.value;
  const confirm  = fields.confirm.value;

  if (!validate(username, email, phone, password, confirm)) return;

  setLoading(true, "Checking…");

  try {
    let clerk;
    try {
      clerk = await window.clerkReady;
    } catch {
      setFormMsg("Authentication service unavailable. Please refresh and try again.");
      setLoading(false);
      return;
    }

    // Firebase duplicate check (username + phone — Clerk handles email)
    const snapshot = await db.ref("users").once("value");
    const allUsers = snapshot.val() || {};
    for (const uid in allUsers) {
      const u = allUsers[uid];
      if (u.username && u.username.toLowerCase() === username.toLowerCase()) {
        showError("username", "Username already taken."); setLoading(false); return;
      }
      if (u.phone && u.phone === phone) {
        showError("phone", "Phone number already registered."); setLoading(false); return;
      }
    }

    // Create Clerk account
    // Pass BOTH username AND firstName so either dashboard config works.
    // Clerk ignores fields that aren't enabled in the dashboard.
    setLoading(true, "Creating account…");
    console.log("[Register] Creating signUp for:", email, "username:", username);

    let signUp;
    try {
      signUp = await clerk.client.signUp.create({
        emailAddress: email,
        password,
        username,           // ← correct field name for Clerk "Username" setting
        firstName: username, // ← fallback if "First name" is enabled instead
      });
    } catch (clerkErr) {
      console.error("[Register] signUp.create error:", clerkErr);
      setFormMsg(clerkErrMsg(clerkErr));
      setLoading(false);
      return;
    }

    console.log("[Register] signUp.id:", signUp.id);
    console.log("[Register] signUp.status:", signUp.status);
    console.log("[Register] signUp.missingFields:", signUp.missingFields);
    console.log("[Register] signUp.requiredFields:", signUp.requiredFields);

    // Send email verification code
    setLoading(true, "Sending verification…");
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      console.log("[Register] ✅ Verification email sent.");
    } catch (clerkErr) {
      console.error("[Register] prepareEmailAddressVerification error:", clerkErr);
      setFormMsg("Failed to send verification email. Please try again.");
      setLoading(false);
      return;
    }

    // Store in module scope — OTP panel uses these
    activeSignUp   = signUp;
    pendingProfile = { username, email, phone };

    setLoading(false);
    showOtpPanel(email);

  } catch (err) {
    console.error("[Register] Unexpected error:", err);
    setFormMsg("Something went wrong. Please try again.");
    setLoading(false);
  }
});
