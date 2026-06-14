// product-details.js — fetch product by ID, render detail page, handle cart

function getQtyInCart(id) {
  const item = getCartItem(id);
  return item ? item.quantity : 0;
}

// ── UI ────────────────────────────────────────────────────────────────────────
function renderAddBtn(actionEl, isAvailable = true) {
  actionEl.innerHTML = isAvailable
    ? `<button class="detail-add-btn" id="detail-add-btn">Add to Cart</button>`
    : `<button class="detail-add-btn" id="detail-add-btn" disabled>Out of Stock</button>`;
}

function renderQty(actionEl, qty, isAvailable = true) {
  actionEl.innerHTML = `
    <div class="qty-selector">
      <button class="qty-btn qty-minus">−</button>
      <span class="qty-count">${qty}</span>
      <button class="qty-btn qty-plus" ${isAvailable ? "" : "disabled"}>+</button>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function () {
  const productId = new URLSearchParams(window.location.search).get("id");
  if (!productId) { document.getElementById("detail-name").textContent = "Product not found."; return; }

  db.ref("products/" + productId).once("value")
    .then(snapshot => {
      const p = snapshot.val();
      if (!p) { document.getElementById("detail-name").textContent = "Product not found."; return; }

      console.log("✅ Product:", p);

      const name  = p.name  || p.title || "";
      const price = typeof resolveIndiaPrice === "function"
        ? resolveIndiaPrice(p)
        : (p.indiaPrice || p.price || 0);
      const internationalPrice = typeof resolveInternationalPrice === "function"
        ? resolveInternationalPrice(p)
        : (p.internationalPrice || price);
      const img   = p.image || "";
      const desc  = p.desc  || p.description || "";

      document.getElementById("detail-img").src          = img;
      document.getElementById("detail-img").alt          = name;
      document.getElementById("detail-name").textContent = name;
      document.getElementById("detail-price").textContent = price ? "₹" + price : "";
      document.getElementById("detail-desc").textContent  = desc;
      document.title = name + " - Gujjuben's Khakhra";

      if (typeof formatProductPrice === "function") {
        formatProductPrice({ indiaPrice: price, internationalPrice })
          .then((displayPrice) => {
            document.getElementById("detail-price").textContent = displayPrice;
          })
          .catch(() => {
            document.getElementById("detail-price").textContent = price ? "₹" + price : "";
          });
      }

      const actionEl = document.getElementById("detail-action");
      const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;
      const qty = getQtyInCart(productId);
      if (qty > 0) renderQty(actionEl, qty, isAvailable);
      else renderAddBtn(actionEl, isAvailable);

      // Events
      actionEl.addEventListener("click", function (e) {
        if (e.target.id === "detail-add-btn" || e.target.classList.contains("detail-add-btn")) {
          if (!isAvailable) return;
          const qty = addToCart({ id: productId, name, price, indiaPrice: price, internationalPrice, image: img, quantity: 1 });
          renderQty(actionEl, qty, isAvailable);
        }
        if (e.target.classList.contains("qty-plus")) {
          if (!isAvailable) return;
          const qty = increaseQuantity(productId);
          actionEl.querySelector(".qty-count").textContent = qty;
        }
        if (e.target.classList.contains("qty-minus")) {
          const qty = decreaseQuantity(productId);
          if (qty === 0) renderAddBtn(actionEl, isAvailable);
          else actionEl.querySelector(".qty-count").textContent = qty;
        }
      });

      window.addEventListener("cart-updated", () => {
        const qty = getQtyInCart(productId);
        if (qty > 0) renderQty(actionEl, qty, isAvailable);
        else renderAddBtn(actionEl, isAvailable);
      });
    })
    .catch(err => console.error("❌ Product fetch error:", err));
})();


// ── Reviews ───────────────────────────────────────────────────────────────────
(function () {
  const productId = new URLSearchParams(window.location.search).get("id");
  if (!productId) return;

  const reviewList    = document.getElementById("review-list");
  const ratingAvg     = document.getElementById("rating-avg");
  const ratingStars   = document.getElementById("rating-stars-avg");
  const ratingCount   = document.getElementById("rating-count");
  const starPicker    = document.getElementById("star-picker");
  const ratingInput   = document.getElementById("review-rating");
  const reviewForm    = document.getElementById("review-form");
  const reviewMsg     = document.getElementById("review-msg");

  let selectedRating = 0;

  // ── Star picker interaction ─────────────────────────────────────────────────
  if (starPicker) {
    const stars = starPicker.querySelectorAll(".star");

    stars.forEach(star => {
      star.addEventListener("mouseover", () => highlightStars(+star.dataset.val));
      star.addEventListener("mouseleave", () => highlightStars(selectedRating));
      star.addEventListener("click", () => {
        selectedRating = +star.dataset.val;
        ratingInput.value = selectedRating;
        highlightStars(selectedRating);
      });
    });

    function highlightStars(val) {
      stars.forEach(s => s.classList.toggle("active", +s.dataset.val <= val));
    }
  }

  // ── Render stars string ─────────────────────────────────────────────────────
  function starsHTML(rating) {
    const full  = Math.round(rating);
    return "★".repeat(full) + "☆".repeat(5 - full);
  }

  // ── Load & render reviews ───────────────────────────────────────────────────
  function loadReviews() {
    db.ref("reviews/" + productId).orderByChild("createdAt").once("value")
      .then(snapshot => {
        if (!snapshot.exists()) return;

        const reviews = [];
        snapshot.forEach(child => reviews.push({ id: child.key, ...child.val() }));
        reviews.reverse(); // newest first

        // Average
        const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
        ratingAvg.textContent   = avg.toFixed(1);
        ratingStars.textContent = starsHTML(avg);
        ratingCount.textContent = reviews.length + " review" + (reviews.length !== 1 ? "s" : "");

        // Cards
        reviewList.innerHTML = reviews.map(r => `
          <div class="review-card">
            <div class="review-card-header">
              <span class="review-author">${r.name || "Anonymous"}</span>
              <span class="review-stars">${starsHTML(r.rating || 0)}</span>
            </div>
            <div class="review-date">${r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : ""}</div>
            <div class="review-text">${r.text || ""}</div>
          </div>`
        ).join("");
      })
      .catch(err => console.error("❌ Reviews fetch error:", err));
  }

  loadReviews();

  // ── Submit review ───────────────────────────────────────────────────────────
  if (reviewForm) {
    reviewForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const name   = document.getElementById("review-name").value.trim();
      const rating = parseInt(ratingInput.value, 10);
      const text   = document.getElementById("review-text").value.trim();

      if (!name) {
        showMsg("Please enter your name.", "error"); return;
      }
      if (!rating || rating < 1) {
        showMsg("Please select a star rating.", "error"); return;
      }
      if (!text) {
        showMsg("Please write your review.", "error"); return;
      }

      const submitBtn = reviewForm.querySelector(".review-submit-btn");
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      db.ref("reviews/" + productId).push({
        name,
        rating,
        text,
        createdAt: new Date().toISOString()
      })
      .then(() => {
        showMsg("✅ Review submitted! Thank you.", "success");
        reviewForm.reset();
        selectedRating = 0;
        ratingInput.value = 0;
        document.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
        loadReviews();
      })
      .catch(err => {
        console.error("❌ Review submit error:", err);
        showMsg("Something went wrong. Please try again.", "error");
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Review";
      });
    });
  }

  function showMsg(msg, type) {
    reviewMsg.textContent  = msg;
    reviewMsg.className    = "review-msg " + type;
    setTimeout(() => { reviewMsg.textContent = ""; reviewMsg.className = "review-msg"; }, 4000);
  }
})();
