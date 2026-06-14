// ─────────────────────────────────────────────────────────────────
//  otp.js  –  Email OTP Verification
//
//  Reads pendingAuth from sessionStorage (set by auth-email.js / login.js):
//    { flow: "signIn" | "signUp", email: string }
//
//  SIGN-IN FLOW:
//    clerk.client.signIn.attemptFirstFactor({ strategy: "email_code", code })
//    → setActive({ session: createdSessionId })
//    → upsert Firebase user (update lastLogin if exists, create if new)
//    → store localStorage session → redirect
//
//  SIGN-UP FLOW:
//    clerk.client.signUp.attemptEmailAddressVerification({ code })
//    → handle missing_requirements via signUp.update() if needed
//    → setActive({ session: createdSessionId })
//    → create Firebase user → store localStorage session → redirect
// ─────────────────────────────────────────────────────────────────

// ── Firebase init ─────────────────────────────
const firebaseConfig = {
  apiKey           : "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain       : "khakhra-5cb3d.firebaseapp.com",
  databaseURL      : "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId        : "khakhra-5cb3d",
  storageBucket    : "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId            : "1:713999821089:web:f0c25da51cff322d61b660",
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── Read pending auth state ───────────────────
const pendingAuth = JSON.parse(sessionStorage.getItem("pendingAuth") || "null");

if (!pendingAuth?.email || !pendingAuth?.flow) {
  window.location.replace("/login");
}

const { email, flow } = pendingAuth || {};

// ── DOM refs ──────────────────────────────────
const emailDisplay = document.getElementById("otp-email-display");
const boxes        = Array.from(document.querySelectorAll(".otp-box"));
const verifyBtn    = document.getElementById("verify-btn");
const resendBtn    = document.getElementById("resend-btn");
const timerEl      = document.getElementById("otp-timer");
const countdownEl  = document.getElementById("countdown");
const msgEl        = document.getElementById("otp-msg");

// Show masked email
if (emailDisplay && email) {
  const [local, domain] = email.split("@");
  emailDisplay.textContent = local.slice(0, 2) + "****@" + domain;
}

// ── Timer ─────────────────────────────────────
let timerInterval = null;
let isVerifying   = false;

function startTimer(seconds = 30) {
  clearInterval(timerInterval);
  resendBtn.disabled      = true;
  timerEl.style.display   = "block";
  countdownEl.textContent = seconds;

  timerInterval = setInterval(() => {
    seconds--;
    countdownEl.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(timerInterval);
      timerEl.style.display = "none";
      resendBtn.disabled    = false;
    }
  }, 1000);
}

startTimer(30);

// ── OTP box interactions ──────────────────────
boxes.forEach((box, i) => {
  box.addEventListener("keydown", (e) => {
    if (!/^\d$/.test(e.key) &&
        !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }
  });

  box.addEventListener("input", (e) => {
    const val = e.target.value.replace(/\D/g, "");
    box.value = val ? val[0] : "";
    box.classList.toggle("filled", !!box.value);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    checkAllFilled();
  });

  box.addEventListener("keyup", (e) => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
  });

  box.addEventListener("click", () => box.select());
});

// Paste support
document.getElementById("otp-inputs").addEventListener("paste", (e) => {
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData)
    .getData("text").replace(/\D/g, "").slice(0, 6);
  pasted.split("").forEach((digit, i) => {
    if (boxes[i]) { boxes[i].value = digit; boxes[i].classList.add("filled"); }
  });
  boxes[Math.min(pasted.length, 5)]?.focus();
  checkAllFilled();
});

function checkAllFilled() {
  verifyBtn.disabled = !boxes.every(b => b.value.length === 1);
}

function getCode() {
  return boxes.map(b => b.value).join("");
}

// ── Message helpers ───────────────────────────
function showMsg(text, ok = false) {
  msgEl.textContent = text;
  msgEl.className   = "otp-msg" + (ok ? " success" : "");
}

function setLoading(loading) {
  isVerifying        = loading;
  verifyBtn.disabled = loading;
  verifyBtn.classList.toggle("loading", loading);
  const spinner = document.getElementById("spinner");
  if (spinner) spinner.style.display = loading ? "block" : "none";
}

// ── Firebase: upsert user (idempotent) ────────
// Creates new record OR updates lastLogin for existing user.
async function upsertFirebaseUser(clerkUser) {
  const uid      = clerkUser.id;
  const userEmail = clerkUser.primaryEmailAddress?.emailAddress || email;
  const name     = clerkUser.fullName
                || clerkUser.firstName
                || clerkUser.username
                || userEmail.split("@")[0]
                || "Customer";
  const photoURL = clerkUser.imageUrl || clerkUser.profileImageUrl || "";
  const now      = new Date().toISOString();

  const snap = await db.ref(`users/${uid}`).once("value");

  if (snap.exists()) {
    // Existing user — update lastLogin only
    await db.ref(`users/${uid}/lastLogin`).set(now);
    console.log("[Firebase] ✅ Existing user — lastLogin updated.");
    return;
  }

  // New user — create full record
  await db.ref(`users/${uid}`).set({
    uid,
    clerkId  : uid,
    email    : userEmail,
    name,
    photoURL,
    provider : "email",
    role     : "customer",
    createdAt: now,
    lastLogin: now,
  });
  console.log("[Firebase] ✅ New user record created.");
}

// ── Store localStorage session ────────────────
function storeSession(clerkUser) {
  const uid       = clerkUser.id;
  const userEmail = clerkUser.primaryEmailAddress?.emailAddress || email;
  const name      = clerkUser.fullName || clerkUser.firstName || clerkUser.username || userEmail.split("@")[0] || "Customer";
  localStorage.setItem("user", JSON.stringify({
    id      : uid,
    email   : userEmail,
    username: name,
    role    : "customer",
    provider: "email",
  }));
}

// ── Redirect after success ────────────────────
function redirectAfterAuth() {
  sessionStorage.removeItem("pendingAuth");
  const params   = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  const target   = redirect && /^\/[a-zA-Z0-9_\-]*$/.test(redirect) ? redirect : "/";
  setTimeout(() => { window.location.replace(target); }, 900);
}

// ── Complete: activate session + Firebase + redirect ──
async function completeAuth(clerk, sessionId, userId) {
  // Activate Clerk session
  if (sessionId) {
    await clerk.setActive({ session: sessionId });
    console.log("[OTP] ✅ Clerk session activated.");
  }

  // Reload user after setActive to get fresh data
  const clerkUser = clerk.user;
  if (!clerkUser) throw new Error("Clerk user unavailable after session activation.");

  showMsg("Verified! Setting up your account…", true);
  await upsertFirebaseUser(clerkUser);
  storeSession(clerkUser);
  redirectAfterAuth();
}

// ── SIGN-IN verification ──────────────────────
async function verifySignIn(clerk, code) {
  const result = await clerk.client.signIn.attemptFirstFactor({
    strategy: "email_code",
    code,
  });

  if (result.status !== "complete") {
    throw new Error("Sign-in incomplete. Status: " + result.status);
  }

  await completeAuth(clerk, result.createdSessionId, null);
}

// ── SIGN-UP verification ──────────────────────
async function verifySignUp(clerk, code) {
  const signUp = clerk.client.signUp;

  if (!signUp?.status) {
    throw new Error("No active sign-up session. Please go back and try again.");
  }

  let result = await signUp.attemptEmailAddressVerification({ code });

  // Handle missing_requirements: supply any fields Clerk still needs
  if (result.status === "missing_requirements" && result.missingFields?.length) {
    const patch = {};
    for (const f of result.missingFields) {
      if (f === "username")                        patch.username  = email.split("@")[0];
      if (f === "first_name" || f === "firstName") patch.firstName = email.split("@")[0];
      if (f === "last_name"  || f === "lastName")  patch.lastName  = "";
    }
    result = await signUp.update(patch);
  }

  if (result.status !== "complete") {
    throw new Error(
      "Sign-up incomplete after verification. Status: " + result.status +
      " missingFields: " + JSON.stringify(result.missingFields)
    );
  }

  await completeAuth(clerk, result.createdSessionId, result.createdUserId);
}

// ── Verify button ─────────────────────────────
verifyBtn.addEventListener("click", async () => {
  if (isVerifying) return;
  const code = getCode();
  if (code.length !== 6) return;

  setLoading(true);
  showMsg("");

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    showMsg("Authentication service unavailable. Please refresh.");
    setLoading(false);
    return;
  }

  try {
    if (flow === "signIn") {
      await verifySignIn(clerk, code);
    } else {
      await verifySignUp(clerk, code);
    }
  } catch (err) {
    const clerkCode = err?.errors?.[0]?.code;

    if (clerkCode === "form_code_incorrect") {
      showMsg("Incorrect code. Please check your email and try again.");
    } else if (clerkCode === "verification_expired") {
      showMsg("Code expired. Click Resend to get a new one.");
    } else if (clerkCode === "verification_already_verified") {
      // Already verified — session may already be active
      showMsg("Already verified. Completing sign-in…", true);
      try {
        const clerkUser = clerk.user;
        if (clerkUser) {
          await upsertFirebaseUser(clerkUser);
          storeSession(clerkUser);
          redirectAfterAuth();
        } else {
          showMsg("Session error. Please go back and try again.");
          setLoading(false);
        }
      } catch {
        showMsg("Please try signing in again.");
        setLoading(false);
      }
    } else {
      showMsg(
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Verification failed. Please try again."
      );
      setLoading(false);
    }
  }
});

// ── Resend button ─────────────────────────────
resendBtn.addEventListener("click", async () => {
  resendBtn.disabled = true;
  showMsg("");

  let clerk;
  try {
    clerk = await window.clerkReady;
  } catch {
    showMsg("Authentication service unavailable.");
    resendBtn.disabled = false;
    return;
  }

  try {
    if (flow === "signIn") {
      await clerk.client.signIn.create({
        strategy  : "email_code",
        identifier: email,
      });
    } else {
      const signUp = clerk.client.signUp;
      if (!signUp?.status) {
        showMsg("Session expired. Please go back and try again.");
        resendBtn.disabled = false;
        return;
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    }

    boxes.forEach(b => { b.value = ""; b.classList.remove("filled"); });
    boxes[0]?.focus();
    verifyBtn.disabled = true;
    showMsg("New code sent to your email.", true);
    startTimer(30);

  } catch (err) {
    showMsg("Failed to resend. Please try again.");
    resendBtn.disabled = false;
  }
});

// ── On load: already authenticated? ──────────
// If user somehow lands here already signed in, skip OTP
window.addEventListener("load", async () => {
  try {
    const clerk = await window.clerkReady;
    if (clerk.user) {
      const clerkUser = clerk.user;
      await upsertFirebaseUser(clerkUser);
      storeSession(clerkUser);
      redirectAfterAuth();
    }
  } catch { /* not authenticated — normal, show OTP form */ }
});

// Focus first box
boxes[0]?.focus();
