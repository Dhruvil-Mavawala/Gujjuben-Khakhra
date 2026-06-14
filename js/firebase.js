// Firebase compat SDK — loaded via CDN scripts in HTML
// firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain: "khakhra-5cb3d.firebaseapp.com",
  databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId: "khakhra-5cb3d",
  storageBucket: "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId: "1:713999821089:web:f0c25da51cff322d61b660",
  measurementId: "G-G0VX1KE5F6"
};

const app     = firebase.initializeApp(firebaseConfig);
const db      = firebase.database();
// Guard: Storage SDK is only loaded on admin pages, not on public pages
const storage = typeof firebase.storage === "function" ? firebase.storage() : null;

// ── Fetch categories & render cards ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  const container = document.getElementById("category-container")
                 || document.querySelector(".frame-5476");
  if (!container) return;

  // Hide until Firebase data is ready
  container.style.display = "none";

  container.addEventListener("click", function (e) {
    const card = e.target.closest(".category[data-id]");
    if (card) {
      location.href = "/productlist?category=" + card.dataset.id;
    }
  });

  db.ref("categories").once("value")
    .then(snapshot => {
      const data = snapshot.val();
      if (!data) return; // no data — keep hidden

      container.innerHTML = "";

      // Shuffle and pick max 5 random categories
      const entries = Object.entries(data)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);

      entries.forEach(([id, cat]) => {
        const card = document.createElement("div");
        card.className    = "category";
        card.dataset.id   = id;
        card.style.cursor = "pointer";
        card.innerHTML = `
          <div class="cat-img-wrap">
            <img class="cat-img" src="${cat.image || ''}" alt="${cat.name || ''}" />
            <div class="cat-overlay"></div>
            <div class="cat-label">
              <span class="cat-name">${cat.name || ''}</span>
              <span class="cat-cta">View all →</span>
            </div>
          </div>`;
        container.appendChild(card);
      });

      // Show only after all cards are rendered
      container.style.display = "grid";
    })
    .catch(err => {
      console.error("❌ Error fetching categories:", err);
    });
});

// ── Contact form handler ──────────────────────────────────────────────────────
function handleFormSubmit(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name    = form.querySelector(".input-name")?.value.trim();
    const phone   = form.querySelector(".input-phone")?.value.trim();
    const email   = form.querySelector(".input-email")?.value.trim();
    const message = form.querySelector(".input-message")?.value.trim();

    if (!name || !phone || !email) {
      alert("Please fill in all required fields.");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    try {
      await db.ref("contacts").push({
        name, phone, email,
        message: message || "",
        source: formId,
        createdAt: new Date().toISOString()
      });
      alert("Thank you! Your message has been submitted.");
      form.reset();
    } catch (err) {
      console.error("Firebase error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// handleFormSubmit("contact-form");
// handleFormSubmit("order-form");
// handleFormSubmit("deal-form");
// handleFormSubmit("cart-contact-form");
