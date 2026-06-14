// ─────────────────────────────────────────────────────────────────
//  config.js  –  Frontend Public Configuration
//  Phase 1.2: Centralized config for all frontend pages.
//
//  RULES:
//  ✅ Only PUBLISHABLE keys allowed here (pk_test_...)
//  ❌ NEVER put secret keys (sk_test_...) in this file
//  ❌ NEVER put Razorpay secret here
//  ❌ NEVER put MC_AUTH_TOKEN here
// ─────────────────────────────────────────────────────────────────

window.APP_CONFIG = {

  // Clerk Browser SDK
  // Get from: https://dashboard.clerk.com → Your App → API Keys
  CLERK_PUBLISHABLE_KEY : "pk_test_cHJvYmFibGUtbW9zcXVpdG8tMjMuY2xlcmsuYWNjb3VudHMuZGV2JA",
  CLERK_FRONTEND_API    : "https://probable-mosquito-23.clerk.accounts.dev",

  // Backend API base URL
  // In production: Netlify proxies /api/* → Render backend (no CORS issues)
  // In development: hits localhost Express server directly
  API_BASE_URL : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "/api",

  // Razorpay publishable key (KEY_ID only — NOT the secret)
  // Get from: https://dashboard.razorpay.com → Settings → API Keys
  RAZORPAY_KEY_ID : "rzp_live_SwqAdCXaHRZnI9",

};

// Freeze to prevent accidental mutation
Object.freeze(window.APP_CONFIG);
