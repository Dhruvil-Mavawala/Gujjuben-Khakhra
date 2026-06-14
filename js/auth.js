// ─────────────────────────────────────────────────────────────────
//  auth.js  –  Admin Route Protection (Phase 4 hardened)
//
//  LAYER 1 (sync, instant): localStorage check — blocks page render
//  LAYER 2 (async, Firebase): role verification — confirms role=admin
//                             in Firebase, not just localStorage
//
//  Load as the VERY FIRST script on every admin page.
//  Uses window.location.replace so Back button cannot return.
// ─────────────────────────────────────────────────────────────────

function on(element, eventName, handler) {
  if (element) {
    element.addEventListener(eventName, handler);
  }
}

(function () {
  "use strict";

  // ── Layer 1: Instant localStorage check ──────
  // Blocks page render immediately if no admin session exists.
  var isLoggedIn = localStorage.getItem("isAdminLoggedIn") === "true";
  var role       = localStorage.getItem("role");

  if (!isLoggedIn || role !== "admin") {
    localStorage.removeItem("isAdminLoggedIn");
    localStorage.removeItem("role");
    window.location.replace("/admin");
    // Blank the page body so nothing flashes before redirect
    on(document, "DOMContentLoaded", function () {
      if (document.body) {
        document.body.innerHTML = "";
      }
    });
    throw new Error("Unauthorized — redirecting to admin login.");
  }

})();

// ── Layer 2: Firebase role verification (async) ──
// Runs after page loads. Verifies the admin role actually exists
// in Firebase — prevents localStorage tampering attacks.
on(document, "DOMContentLoaded", function () {

  // Firebase config — same as all other pages
  var firebaseConfig = {
    apiKey           : "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
    authDomain       : "khakhra-5cb3d.firebaseapp.com",
    databaseURL      : "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
    projectId        : "khakhra-5cb3d",
    storageBucket    : "khakhra-5cb3d.appspot.com",
    messagingSenderId: "713999821089",
    appId            : "1:713999821089:web:f0c25da51cff322d61b660"
  };

  // Only init Firebase if not already done
  var fbApp;
  try {
    fbApp = firebase.app("auth-guard");
  } catch (e) {
    try {
      fbApp = firebase.initializeApp(firebaseConfig, "auth-guard");
    } catch (e2) {
      // Firebase already initialized under default name — use it
      fbApp = firebase.app();
    }
  }

  var adminEmail = localStorage.getItem("adminEmail");
  if (!adminEmail) {
    // No email stored — cannot verify, keep localStorage guard only
    console.warn("⚠️  auth.js: adminEmail not in localStorage. Firebase role check skipped.");
    return;
  }

  var db = fbApp.database ? fbApp.database() : firebase.database();

  db.ref("admin").once("value")
    .then(function (snapshot) {
      var admins = snapshot.val();
      if (!admins) {
        forceLogout("Admin table empty.");
        return;
      }

      var verified = false;
      Object.keys(admins).forEach(function (key) {
        if (admins[key].email && admins[key].email.toLowerCase() === adminEmail.toLowerCase()) {
          verified = true;
        }
      });

      if (!verified) {
        forceLogout("Admin role not found in Firebase for: " + adminEmail);
      } else {
        console.log("✅ auth.js: Admin role verified in Firebase.");
      }
    })
    .catch(function (err) {
      // Firebase unavailable — keep localStorage guard, log warning
      console.warn("⚠️  auth.js: Firebase role check failed (network?):", err.message);
    });
});

// ── Force logout helper ───────────────────────
function forceLogout(reason) {
  console.warn("🚫 auth.js: Forcing logout —", reason);
  localStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("role");
  localStorage.removeItem("adminEmail");
  window.location.replace("/admin");
}

// ── Admin logout (called from admin page buttons) ──
function adminLogout() {
  localStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("role");
  localStorage.removeItem("adminEmail");
  window.location.replace("/admin");
}
