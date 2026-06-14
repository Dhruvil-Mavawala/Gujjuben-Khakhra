// ─────────────────────────────────────────────────────────────────
//  clerk-init.js  –  Clerk Browser SDK Initialization
//
//  Reads publishable key from window.APP_CONFIG (set in js/config.js).
//  Exposes window.clerkReady — a Promise that resolves with the
//  initialized Clerk instance. Other scripts await this promise
//  instead of listening for the clerk:ready event.
//
//  Load order in HTML:
//    1. Clerk SDK <script async ...>
//    2. js/config.js
//    3. js/clerk-init.js
//    4. page-specific JS (register.js, login.js, etc.)
// ─────────────────────────────────────────────────────────────────

// Expose a promise other scripts can await
window.clerkReady = new Promise((resolve, reject) => {

  async function initClerk() {
    const publishableKey = window.APP_CONFIG?.CLERK_PUBLISHABLE_KEY;

    if (!publishableKey || !publishableKey.startsWith("pk_")) {
      const msg = "⚠️  Clerk: Publishable key not set. Open js/config.js and set CLERK_PUBLISHABLE_KEY.";
      console.warn(msg);
      reject(new Error(msg));
      return;
    }

    // The Clerk SDK script is async — poll until window.Clerk appears
    let attempts = 0;
    while (typeof window.Clerk === "undefined") {
      if (attempts++ > 50) {
        const msg = "❌ Clerk SDK did not load after 5s. Check the <script> tag src URL.";
        console.error(msg);
        reject(new Error(msg));
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    try {
      await window.Clerk.load({ publishableKey });

      console.log("✅ Clerk initialized successfully.");
      console.log("   Version:", window.Clerk.version ?? "unknown");
      console.log("   Env:", publishableKey.startsWith("pk_live_") ? "production" : "development");

      window.dispatchEvent(new CustomEvent("clerk:ready", { detail: { clerk: window.Clerk } }));
      resolve(window.Clerk);

    } catch (err) {
      console.error("❌ Clerk initialization failed:", err.message || err);
      reject(err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initClerk);
  } else {
    initClerk();
  }
});
