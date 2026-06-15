// contact-form.js
// Shared contact / enquiry form handler for all pages
// (index.html, cart.html, productlist.html, product-detail.html, about.html)
// Requires: Firebase (db), intl-tel-input, toast.js loaded first

(function () {
  "use strict";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
    authDomain: "khakhra-5cb3d.firebaseapp.com",
    databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
    projectId: "khakhra-5cb3d",
    storageBucket: "khakhra-5cb3d.appspot.com",
    messagingSenderId: "713999821089",
    appId: "1:713999821089:web:f0c25da51cff322d61b660",
  };

  function ensureFirebase() {
    if (typeof firebase === "undefined") return null;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.database();
  }

  // Detect page source from path
  function getSource() {
    const p = window.location.pathname;
    if (p.includes("product-detail") || p.includes("product-details"))
      return "product-detail";
    if (p.includes("productlist") || p.includes("/products"))
      return "productlist";
    if (p.includes("cart")) return "cart";
    if (p.includes("about")) return "about";
    return "home";
  }

  // Forms to initialize: { formId, phoneSelector, nameSelector, emailSelector, msgSelector }
  const FORM_CONFIGS = [
    { id: "contact-form", page: "home" },
    { id: "cart-contact-form", page: "cart" },
    { id: "order-form", page: "productlist" },
    { id: "deal-form", page: "product-detail" },
  ];

  function initForm(cfg) {
    const form = document.getElementById(cfg.id);
    if (!form) return;

    const nameEl = form.querySelector(".input-name");
    const phoneEl = form.querySelector(".input-phone");
    const emailEl = form.querySelector(".input-email");
    const msgEl = form.querySelector(".input-message");
    const btn = form.querySelector(".deal-submit-btn");

    if (!phoneEl) return;

    // ── intl-tel-input ─────────────────────────
    let iti = null;
    if (typeof intlTelInput !== "undefined") {
      // Wrap the phone input
      iti = intlTelInput(phoneEl, {
        utilsScript:
          "https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.0/build/js/utils.js",
        initialCountry: "IN",
        preferredCountries: ["IN", "US", "GB", "AE", "CA", "AU", "SG"],
        separateDialCode: true,
        autoPlaceholder: "aggressive",
      });
    }

    // ── Form submit ─────────────────────────────
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const name = nameEl ? nameEl.value.trim() : "";
      const countryData = iti ? iti.getSelectedCountryData() : null;

      const phone = phoneEl
        ? `+${countryData?.dialCode || ""}${phoneEl.value.trim()}`
        : "";
      const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
      const msg = msgEl ? msgEl.value.trim() : "";

      // Basic validation
      let errors = [];
      if (!name) errors.push("Name is required.");

      const digitsOnly = phoneEl.value.replace(/\D/g, "");

      if (digitsOnly.length < 10) {
        errors.push("Enter a valid phone number.");
      }

      if (!email.includes("@")) errors.push("Enter a valid email.");

      if (errors.length) {
        alert("Validation Error: " + errors[0]);
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending…";
      }

      try {
        const db = ensureFirebase();
        if (db) {
          const countryData = iti ? iti.getSelectedCountryData() : null;

          await db.ref("contacts").push({
            name,
            phone,
            email,
            message: msg || "",

            countryCode: countryData ? `+${countryData.dialCode}` : "",
            countryName: countryData ? countryData.name : "",
            countryIso: countryData ? countryData.iso2.toUpperCase() : "",

            source: getSource(),
            createdAt: new Date().toISOString(),
          });
        }

        if (typeof showToast === "function")
          showToast("Message sent! We'll get back to you soon. ✅", "success");
        form.reset();
        if (iti) iti.setCountry("IN");
      } catch (err) {
        console.error("[ContactForm] submit error:", err);
        if (typeof showToast === "function")
          showToast("Something went wrong. Please try again.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Send Message";
        }
      }
    });
  }

  // Init all forms after DOM ready
  function init() {
    FORM_CONFIGS.forEach(initForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
