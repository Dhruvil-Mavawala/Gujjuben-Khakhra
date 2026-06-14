// deal.js — Deal With Us page: Firebase form + validation + intl-tel-input

const firebaseConfig = {
  apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain: "khakhra-5cb3d.firebaseapp.com",
  databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId: "khakhra-5cb3d",
  storageBucket: "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId: "1:713999821089:web:f0c25da51cff322d61b660"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── DOM refs ──────────────────────────────────
const form       = document.getElementById("deal-enquiry-form");
const submitBtn  = document.getElementById("d-submit");
const submitLbl  = document.getElementById("d-submit-label");
const successEl  = document.getElementById("dform-success");
const errGlobal  = document.getElementById("dform-err-global");

// ── intl-tel-input setup ──────────────────────
let iti = null;
const phoneInput = document.getElementById("d-phone");
if (phoneInput && typeof intlTelInput !== "undefined") {
  iti = intlTelInput(phoneInput, {
    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.0/build/js/utils.js",
    initialCountry: "auto",
    geoIpLookup: function (callback) {
      fetch("https://ipapi.co/json/")
        .then(r => r.json())
        .then(data => callback(data.country_code || "IN"))
        .catch(() => callback("IN"));
    },
    preferredCountries: ["IN", "US", "GB", "AE", "CA", "AU", "SG"],
    separateDialCode: true,
    autoPlaceholder: "polite",
    dropdownContainer: document.body,
  });
}

// ── Field helpers ─────────────────────────────
function fieldErr(errId, inputId, msg) {
  const errEl   = document.getElementById(errId);
  const inputEl = document.getElementById(inputId);
  if (errEl)   errEl.textContent = msg;
  if (inputEl) inputEl.classList.toggle("invalid", !!msg);
}

function clearAll() {
  ["derr-name","derr-phone","derr-email"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  ["d-name","d-phone","d-email"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("invalid");
  });
  successEl.textContent  = "";
  errGlobal.textContent  = "";
}

// ── Validation ────────────────────────────────
function validate(name, phoneRaw, email) {
  let ok = true;
  if (!name.trim()) {
    fieldErr("derr-name", "d-name", "Name is required."); ok = false;
  }

  // Phone validation — use intl-tel-input if available, else fallback
  if (iti) {
    if (!iti.isValidNumber()) {
      fieldErr("derr-phone", "d-phone", "Enter a valid phone number."); ok = false;
    }
  } else {
    const stripped = phoneRaw.replace(/\D/g, "");
    if (stripped.length < 7 || stripped.length > 15) {
      fieldErr("derr-phone", "d-phone", "Enter a valid phone number."); ok = false;
    }
  }

  if (!email.includes("@") || !email.includes(".")) {
    fieldErr("derr-email", "d-email", "Enter a valid email address."); ok = false;
  }
  return ok;
}

// ── Submit ────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAll();

  const name    = document.getElementById("d-name").value.trim();
  // Get full international number if intl-tel-input is active
  const phone   = iti ? iti.getNumber() : phoneInput.value.replace(/\D/g, "");
  const email   = document.getElementById("d-email").value.trim().toLowerCase();
  const type    = document.getElementById("d-type").value;
  const message = document.getElementById("d-message").value.trim();

  if (!validate(name, phone, email)) return;

  submitBtn.disabled    = true;
  submitLbl.textContent = "Sending…";

  try {
    await db.ref("contacts").push({
      name,
      phone,
      email,
      message : message || "",
      type,
      source  : "deal",
      createdAt: new Date().toISOString()
    });

    successEl.textContent = "✅ Request submitted successfully! We'll contact you within 24 hours.";
    form.reset();
    if (iti) iti.setCountry("IN");

    if (typeof showToast === "function") {
      showToast("Request submitted successfully! 🎉", "success");
    }

  } catch (err) {
    console.error("Deal form error:", err);
    errGlobal.textContent = "Something went wrong. Please try again.";
    if (typeof showToast === "function") {
      showToast("Submission failed. Please try again.", "error");
    }
  } finally {
    submitBtn.disabled    = false;
    submitLbl.textContent = "Send Enquiry";
  }
});
