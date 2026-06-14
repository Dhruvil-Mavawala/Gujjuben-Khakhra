// ─────────────────────────────────────────────────────────────────
//  session.js  –  Customer Session Utilities
//
//  Provides:
//    getSession()      → localStorage user or null
//    isAuthenticated() → boolean
//    requireLogin()    → redirect to login if not authenticated
//                        SAFE: never redirects on PUBLIC_PAGES
//    userLogout()      → sign out Clerk + Firebase + clear storage + redirect
//    watchSession()    → poll Clerk every 60s for expiry
// ─────────────────────────────────────────────────────────────────

// ── Public pages — NEVER redirect away from these ────────────────
const PUBLIC_PAGES = [
  "/login",
  "/auth",
  "/otp",
  "/",
  "/cart",
  "/about",
  "/productlist",
  "/product-detail",
  "/product-details",
  "/prod",
  "/deal",
  "/sso-callback",
  "", // bare domain root
];

// Current page path (e.g. "/orders" or "/")
const _currentPage = (
  window.location.pathname.replace(/\/$/, "") || "/"
).toLowerCase();

console.log("[AUTH] Current page:", _currentPage);

// ── getSession ────────────────────────────────
function getSession() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id) return null;
    return parsed;
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

console.log("[AUTH] User session:", getSession());

// ── isAuthenticated ───────────────────────────
function isAuthenticated() {
  return getSession() !== null;
}

// ── userLogout ────────────────────────────────
// Full sign-out: Clerk → clear storage → redirect
// Sets a flag BEFORE clearing storage so the restore
// listener on the same page knows not to re-inject.
async function userLogout() {
  console.log("[Logout] Starting…");

  // Mark logout in progress BEFORE clearing — prevents the
  // load/restore handler from re-injecting Clerk session data
  sessionStorage.setItem("__loggingOut", "1");

  // Clear local data first so no flicker of logged-in state
  localStorage.removeItem("user");
  sessionStorage.removeItem("pendingAuth");

  try {
    const clerk = await window.clerkReady;
    await clerk.signOut();
    console.log("[Logout] ✅ Clerk signed out.");
  } catch (err) {
    console.error("[Logout] Clerk signOut error:", err);
    // Continue anyway — local data already cleared
  }

  // Final clear of everything
  localStorage.clear();
  sessionStorage.clear(); // also clears __loggingOut flag — that's fine, we're navigating away

  console.log("[Logout] ✅ Storage cleared. Redirecting to login.");

  // Hard redirect — Back button cannot return
  window.location.replace("/login");
}

// ── requireLogin ──────────────────────────────
// Returns true if authenticated, false + redirects if not.
// NEVER redirects on PUBLIC_PAGES.
function requireLogin() {
  if (PUBLIC_PAGES.includes(_currentPage)) {
    return true; // public page — no guard needed
  }

  const user = getSession();
  if (!user) {
    const dest = "/login?redirect=" + encodeURIComponent(_currentPage);
    console.log("[AUTH] Not authenticated → " + dest);
    window.location.replace(dest);
    return false;
  }

  console.log("[AUTH] Authenticated as:", user.email || user.id);
  return true;
}

// ── watchSession ──────────────────────────────
// Polls Clerk every 60s. Redirects ONLY after confirmed expiry.
function watchSession(redirectTo) {
  const target = redirectTo || "/login";

  if (PUBLIC_PAGES.includes(_currentPage)) return;

  window.clerkReady
    .then((clerk) => {
      const interval = setInterval(async () => {
        try {
          if (clerk.session) {
            await clerk.session.reload();
          }
          if (!clerk.session || clerk.session.status !== "active") {
            clearInterval(interval);
            console.warn("[AUTH] Clerk session expired → " + target);
            _clearAndRedirect(target);
          }
        } catch {
          console.warn("[AUTH] Could not verify Clerk session (network?).");
        }
      }, 60_000);

      window.addEventListener("beforeunload", () => clearInterval(interval));
    })
    .catch(() => {
      // Clerk unavailable — rely on localStorage guard only
    });
}

// ── Internal: clear storage + redirect ───────
function _clearAndRedirect(target) {
  localStorage.removeItem("user");
  localStorage.removeItem("pendingRegistration");
  localStorage.removeItem("tempUser");
  localStorage.removeItem("verificationId");
  sessionStorage.removeItem("pendingAuth");
  window.location.replace(target);
}

// ── Auto-wire logout button (session.js managed) ─
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("user-logout-btn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      userLogout();
    });
  }
});

// ─────────────────────────────────────────────
// Restore localStorage session from Clerk
// after refresh / Google auth / browser reopen
// GUARD: Skip if a logout is in progress
// ─────────────────────────────────────────────
window.addEventListener("load", async () => {
  // Do NOT restore if we're in the middle of logging out
  if (sessionStorage.getItem("__loggingOut")) {
    console.log("[Session Restore] Skipped — logout in progress.");
    return;
  }

  // Do NOT restore on the login/auth/otp/sso pages
  if (["/login", "/auth", "/otp", "/sso-callback"].includes(_currentPage)) {
    return;
  }

  try {
    // Already have a valid local session? Nothing to do.
    const existing = getSession();
    if (existing && existing.id) {
      console.log("[Session Restore] Existing session OK");
      return;
    }

    // Wait for Clerk
    const clerk = await window.clerkReady;

    // No Clerk session
    if (!clerk.user) {
      console.log("[Session Restore] No Clerk user");
      return;
    }

    console.log("[Session Restore] Restoring from Clerk");

    const clerkUser = clerk.user;
    const restoredUser = {
      id      : clerkUser.id,
      email   : clerkUser.primaryEmailAddress?.emailAddress || "",
      username: clerkUser.fullName || clerkUser.firstName || clerkUser.username || "Customer",
      role    : "customer",
      provider: clerkUser.externalAccounts?.length ? "google" : "email",
    };

    localStorage.setItem("user", JSON.stringify(restoredUser));
    window.dispatchEvent(new Event("storage"));
    console.log("[Session Restore] ✅ localStorage restored", restoredUser);
  } catch (err) {
    console.error("[Session Restore Error]", err);
  }
});

// ── Expose globally ───────────────────────────
window.PUBLIC_PAGES    = PUBLIC_PAGES;
window.getSession      = getSession;
window.isAuthenticated = isAuthenticated;
window.userLogout      = userLogout;
window.requireLogin    = requireLogin;
window.watchSession    = watchSession;
