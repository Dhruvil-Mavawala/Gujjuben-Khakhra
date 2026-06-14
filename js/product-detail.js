// product-detail.js - detail page with shared localStorage cart

// Session — read from localStorage (written by login.js / otp.js)
const _user = JSON.parse(localStorage.getItem("user") || "null");
if (_user) {
  console.log("✅ Session active:", _user.username, "| id:", _user.id);
} else {
  console.log("ℹ️ No session — add to cart will redirect to login");
}

// ── Shop by Category ─────────────────────────────────────────────────────────
(function () {
  const grid = document.getElementById("category-grid");
  if (!grid) return;

  db.ref("categories").once("value")
    .then(snapshot => {
      if (!snapshot.exists()) return;

      grid.innerHTML = "";
      snapshot.forEach(child => {
        const cat  = child.val();
        const id   = child.key;
        const name = cat.name  || "";
        const img  = cat.image || "";

        const card = document.createElement("div");
        card.className = "category-card";
        card.innerHTML = `
          <div class="category-card-img-wrap">
            <img class="category-card-img" src="${img}" alt="${name}" />
          </div>
          <div class="category-card-body">
            <div class="category-card-name">${name}</div>
            <div class="category-card-sub">View all products</div>
          </div>`;
        card.addEventListener("click", () => {
          location.href = "/productlist?category=" + id;
        });
        grid.appendChild(card);
      });
    })
    .catch(err => console.error("❌ Categories fetch error:", err));
})();

// ── Stars helper ──────────────────────────────────────────────────────────────
function starsHTML(n) { return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)); }

// ── Button state helpers ──────────────────────────────────────────────────────
function setViewCartState(btn) {
  btn.dataset.state        = "view";
  btn.disabled = false;
  btn.querySelector(".btn-label").textContent = "Added ✓";
  btn.classList.add("in-cart");

  // Show "View Cart" link + in-cart badge
  const viewLink = document.getElementById("view-cart-link");
  const badge    = document.getElementById("in-cart-badge");
  if (viewLink) viewLink.style.display = "inline-flex";
  if (badge)    badge.style.display    = "inline-flex";
}

function setAddToCartState(btn) {
  btn.dataset.state = "add";
  btn.disabled = false;
  btn.querySelector(".btn-label").textContent = "Add to Cart";
  btn.classList.remove("in-cart");

  const viewLink = document.getElementById("view-cart-link");
  const badge    = document.getElementById("in-cart-badge");
  if (viewLink) viewLink.style.display = "none";
  if (badge) badge.style.display = "none";
}

function setOutOfStockState(btn) {
  btn.dataset.state = "out";
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Out of Stock";
  btn.classList.remove("in-cart");

  const viewLink = document.getElementById("view-cart-link");
  const badge    = document.getElementById("in-cart-badge");
  if (viewLink) viewLink.style.display = "none";
  if (badge) badge.style.display = "none";
}

function setQtyButtonsState(canIncrease, canDecrease) {
  const minusBtn = document.getElementById("qty-minus");
  const plusBtn  = document.getElementById("qty-plus");
  if (minusBtn) minusBtn.disabled = !canDecrease;
  if (plusBtn) plusBtn.disabled = !canIncrease;
}

async function refreshRelatedProductPrices() {
  if (typeof formatProductPrice !== "function") return;

  const cards = Array.from(document.querySelectorAll(".related-product-card"));
  await Promise.all(cards.map(async (card) => {
    const priceEl = card.querySelector(".rc-price");
    if (!priceEl) return;

    const indiaPrice = parseFloat(card.dataset.indiaPrice || "0") || 0;
    if (indiaPrice <= 0) return;

    const internationalPrice = parseFloat(card.dataset.internationalPrice || "0") || indiaPrice;
    const displayPrice = await formatProductPrice({ indiaPrice, internationalPrice });
    priceEl.textContent = displayPrice;
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
(function () {
  const productId = new URLSearchParams(window.location.search).get("id");
  if (!productId) {
    document.getElementById("detail-name").textContent = "Product not found.";
    return;
  }

  let localQty = 1;

  // ── Fetch product ───────────────────────────────────────────────────────────
  db.ref("products/" + productId).once("value")
    .then(snapshot => {
      const p = snapshot.val();
      if (!p) {
        document.getElementById("detail-name").textContent = "Product not found.";
        return;
      }

      const name     = p.title || p.name || "";
      const category = p.categoryName || p.category || "Khakhra";
      const price    = typeof resolveIndiaPrice === "function"
        ? resolveIndiaPrice(p)
        : (p.indiaPrice || p.price || 0);
      const internationalPrice = typeof resolveInternationalPrice === "function"
        ? resolveInternationalPrice(p)
        : (p.internationalPrice || price);
      const img      = p.image1 || p.image || "";
      const desc     = p.description || p.desc || "";

      // Resolve all 3 image slots; old single-image products just have img1
      const img1 = p.image1 || p.image || "";
      const img2 = p.image2 || "";
      const img3 = p.image3 || "";
      const allImages = [img1, img2, img3].filter(Boolean);

      const mainImgEl = document.getElementById("detail-img");
      mainImgEl.src = img1;
      mainImgEl.alt = name;

      // ── Thumbnail gallery with auto-slide ──────────────────────────────────
      const thumbContainer = document.getElementById("detail-thumbnails");
      if (thumbContainer) {
        if (allImages.length > 1) {
          thumbContainer.innerHTML = "";
          let activeIdx = 0;
          let autoSlideTimer = null;
          let pauseTimer = null;

          function setActive(idx) {
            activeIdx = (idx + allImages.length) % allImages.length;
            mainImgEl.src = allImages[activeIdx];
            thumbContainer.querySelectorAll(".thumb-img").forEach(function (t, i) {
              t.classList.toggle("active", i === activeIdx);
            });
          }

          function startAutoSlide() {
            stopAutoSlide();
            autoSlideTimer = setInterval(function () {
              setActive(activeIdx + 1);
            }, 3000);
          }

          function stopAutoSlide() {
            if (autoSlideTimer) { clearInterval(autoSlideTimer); autoSlideTimer = null; }
          }

          function pauseThenResume() {
            stopAutoSlide();
            if (pauseTimer) clearTimeout(pauseTimer);
            pauseTimer = setTimeout(startAutoSlide, 5000);
          }

          allImages.forEach(function (imgUrl, idx) {
            const thumb = document.createElement("img");
            thumb.src = imgUrl;
            thumb.alt = name + " image " + (idx + 1);
            thumb.className = "thumb-img" + (idx === 0 ? " active" : "");
            thumb.addEventListener("click", function () {
              setActive(idx);
              pauseThenResume();
            });
            thumbContainer.appendChild(thumb);
          });

          thumbContainer.style.display = "flex";
          startAutoSlide();
        } else {
          thumbContainer.style.display = "none";
        }
      }

      document.getElementById("detail-name").textContent     = name;
      document.getElementById("detail-category").textContent = category;
      document.getElementById("detail-desc").textContent     = desc;
      document.getElementById("detail-price").textContent    = price ? "Rs. " + price : "";
      document.title = name + " - Gujjuben's Khakhra";

      if (typeof formatProductPrice === "function") {
        formatProductPrice({ indiaPrice: price, internationalPrice })
          .then((displayPrice) => {
            document.getElementById("detail-price").textContent = displayPrice;
          })
          .catch(() => {
            document.getElementById("detail-price").textContent = price ? "Rs. " + price : "";
          });
      }

      // ── Qty selector ──────────────────────────────────────────────────────
      const qtyDisplay = document.getElementById("qty-display");
      const addBtn = document.getElementById("add-to-cart-btn");

      const syncQtyState = () => {
        const cartItem = getCartItem(productId);
        const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;
        const qty = cartItem ? cartItem.quantity : 0;

        if (!isAvailable) {
          if (qty > 0) {
            qtyDisplay.textContent = qty;
            setOutOfStockState(addBtn);
            setQtyButtonsState(false, true);
          } else {
            qtyDisplay.textContent = localQty;
            setOutOfStockState(addBtn);
            setQtyButtonsState(false, false);
          }
          return;
        }

        if (qty > 0) {
          localQty = qty;
          qtyDisplay.textContent = qty;
          setViewCartState(addBtn);
          setQtyButtonsState(true, true);
          return;
        }

        localQty = Math.max(1, localQty);
        qtyDisplay.textContent = localQty;
        setAddToCartState(addBtn);
        setQtyButtonsState(true, false);
      };

      document.getElementById("qty-minus").addEventListener("click", () => {
        const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;
        const cartItem = getCartItem(productId);
        if (!isAvailable && !cartItem) return;

        if (cartItem) {
          const qty = decreaseQuantity(productId);
          if (qty === 0) {
            localQty = 1;
            qtyDisplay.textContent = localQty;
            if (isAvailable) {
              setAddToCartState(addBtn);
              setQtyButtonsState(true, false);
            } else {
              setOutOfStockState(addBtn);
              setQtyButtonsState(false, false);
            }
          } else {
            localQty = qty;
            qtyDisplay.textContent = qty;
            if (isAvailable) {
              setViewCartState(addBtn);
              setQtyButtonsState(true, true);
            } else {
              setOutOfStockState(addBtn);
              setQtyButtonsState(false, true);
            }
          }
          return;
        }

        if (localQty > 1) {
          localQty--;
          qtyDisplay.textContent = localQty;
        }
      });
      document.getElementById("qty-plus").addEventListener("click", () => {
        const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;
        if (!isAvailable && !getCartItem(productId)) return;

        const cartItem = getCartItem(productId);
        if (cartItem) {
          const qty = increaseQuantity(productId);
          localQty = qty;
          qtyDisplay.textContent = qty;
          if (isAvailable) {
            setViewCartState(addBtn);
            setQtyButtonsState(true, true);
          } else {
            setOutOfStockState(addBtn);
            setQtyButtonsState(false, true);
          }
          return;
        }

        localQty++;
        qtyDisplay.textContent = localQty;
      });

      // ── Add to cart ───────────────────────────────────────────────────────
      syncQtyState();

      window.addEventListener("cart-updated", syncQtyState);
      window.addEventListener("storage", (event) => {
        if (!event.key || event.key === "cart") syncQtyState();
      });

      addBtn.addEventListener("click", async () => {
        // If already in cart, clicking again goes to cart
        if (addBtn.dataset.state === "view") {
          location.href = "/cart";
          return;
        }

        if (addBtn.dataset.state === "out") {
          return;
        }

        if (!_user) { location.href = "/login"; return; }

        addBtn.disabled = true;
        const originalLabel = addBtn.querySelector(".btn-label").textContent;
        addBtn.querySelector(".btn-label").textContent = "Adding…";

        const qty = addToCart({ id: productId, name, price, indiaPrice: price, internationalPrice, image: img1, quantity: localQty });
        localQty = qty;
        qtyDisplay.textContent = qty;
        setViewCartState(addBtn);
        setQtyButtonsState(true, true);
        addBtn.disabled = false;
        if (typeof showToast === "function") showToast("Added to cart! 🛒", "success");
      });

      // ── Related products ──────────────────────────────────────────────────
      if (p.categoryId) {
        db.ref("products").orderByChild("categoryId").equalTo(p.categoryId).once("value")
          .then(snap => {
            const container = document.getElementById("related-container");
            if (!container || !snap.exists()) return;
            container.innerHTML = "";
            let count = 0;
            snap.forEach(child => {
              if (child.key === productId || count >= 6) return;
              count++;
              const r = child.val();
              const rImg = r.image1 || r.image || "";
              const rName = r.title || r.name || "";
              const relatedIndiaPrice = typeof resolveIndiaPrice === "function"
                ? resolveIndiaPrice(r)
                : (r.indiaPrice || r.price || 0);
              const relatedInternationalPrice = typeof resolveInternationalPrice === "function"
                ? resolveInternationalPrice(r)
                : (r.internationalPrice || relatedIndiaPrice);

              const card = document.createElement("div");
              card.className = "rc-card related-product-card";
              card.dataset.indiaPrice = relatedIndiaPrice;
              card.dataset.internationalPrice = relatedInternationalPrice;
              card.dataset.id = child.key;
              card.innerHTML = `
                <div class="rc-img-wrap">
                  <img class="rc-img" src="${rImg}" alt="${rName}" loading="lazy" />
                </div>
                <div class="rc-body">
                  <div class="rc-name">${rName}</div>
                  <div class="rc-price">${relatedIndiaPrice ? "Rs. " + relatedIndiaPrice : ""}</div>
                  <button class="rc-btn" type="button">Add to Cart</button>
                </div>`;

              card.querySelector(".rc-img-wrap").addEventListener("click", function () {
                location.href = "/product-detail?id=" + child.key;
              });
              card.querySelector(".rc-name").addEventListener("click", function () {
                location.href = "/product-detail?id=" + child.key;
              });
              card.querySelector(".rc-btn").addEventListener("click", function (e) {
                e.stopPropagation();
                if (!_user) { location.href = "/login"; return; }
                addToCart({ id: child.key, name: rName, price: relatedIndiaPrice, indiaPrice: relatedIndiaPrice, internationalPrice: relatedInternationalPrice, image: rImg, quantity: 1 });
                this.textContent = "Added ✓";
                this.disabled = true;
                setTimeout(() => { this.textContent = "Add to Cart"; this.disabled = false; }, 2000);
                if (typeof showToast === "function") showToast(rName + " added to cart! 🛒", "success");
              });

              container.appendChild(card);
            });

            refreshRelatedProductPrices();
          });
      }

      window.addEventListener("pricing-ready", () => {
        if (typeof formatProductPrice === "function") {
          formatProductPrice({ indiaPrice: price, internationalPrice })
            .then((displayPrice) => {
              document.getElementById("detail-price").textContent = displayPrice;
            })
            .catch(() => {
              document.getElementById("detail-price").textContent = price ? "Rs. " + price : "";
            });
        }
        refreshRelatedProductPrices();
      });
    })
    .catch(err => console.error("❌ Product fetch error:", err));

  // ── Reviews ─────────────────────────────────────────────────────────────────
  const reviewList  = document.getElementById("review-list");
  const ratingAvg   = document.getElementById("rating-avg");
  const ratingStars = document.getElementById("rating-stars-avg");
  const ratingCount = document.getElementById("rating-count");
  const detailStars = document.getElementById("detail-stars");
  const detailCount = document.getElementById("detail-review-count");

  function loadReviews() {
    db.ref("reviews/" + productId).orderByChild("createdAt").once("value")
      .then(snap => {
        if (!snap.exists()) return;
        const reviews = [];
        snap.forEach(c => reviews.push({ id: c.key, ...c.val() }));
        reviews.reverse();

        const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
        ratingAvg.textContent   = avg.toFixed(1);
        ratingStars.textContent = starsHTML(avg);
        ratingCount.textContent = reviews.length + " review" + (reviews.length !== 1 ? "s" : "");

        // update inline stars
        if (detailStars) detailStars.innerHTML = `<span style="color:#f5a623;font-size:16px;">${starsHTML(avg)}</span>`;
        if (detailCount) detailCount.textContent = reviews.length + " Reviews";

        reviewList.innerHTML = reviews.map(r => `
          <div class="review-card">
            <div class="review-card-header">
              <span class="review-author">${r.name || "Anonymous"}</span>
              <span class="review-stars">${starsHTML(r.rating || 0)}</span>
            </div>
            <div class="review-date">${r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"}) : ""}</div>
            <div class="review-text">${r.text || ""}</div>
          </div>`).join("");
      })
      .catch(err => console.error("❌ Reviews fetch error:", err));
  }

  loadReviews();

  // Star picker
  let selectedRating = 0;
  const starPicker = document.getElementById("star-picker");
  const ratingInput = document.getElementById("review-rating");
  if (starPicker) {
    const stars = starPicker.querySelectorAll(".star");
    const highlight = val => stars.forEach(s => s.classList.toggle("active", +s.dataset.val <= val));
    stars.forEach(s => {
      s.addEventListener("mouseover",  () => highlight(+s.dataset.val));
      s.addEventListener("mouseleave", () => highlight(selectedRating));
      s.addEventListener("click",      () => { selectedRating = +s.dataset.val; ratingInput.value = selectedRating; highlight(selectedRating); });
    });
  }

  // Submit review
  const reviewForm = document.getElementById("review-form");
  const reviewMsg  = document.getElementById("review-msg");

  function showMsg(msg, type) {
    reviewMsg.textContent = msg;
    reviewMsg.className   = "review-msg " + type;
    setTimeout(() => { reviewMsg.textContent = ""; reviewMsg.className = "review-msg"; }, 4000);
  }

  if (reviewForm) {
    reviewForm.addEventListener("submit", e => {
      e.preventDefault();
      const name   = document.getElementById("review-name").value.trim();
      const rating = parseInt(ratingInput.value, 10);
      const text   = document.getElementById("review-text").value.trim();

      if (!name)          { showMsg("Please enter your name.", "error"); return; }
      if (!rating)        { showMsg("Please select a rating.", "error"); return; }
      if (!text)          { showMsg("Please write your review.", "error"); return; }

      const btn = reviewForm.querySelector(".review-submit-btn");
      btn.disabled = true; btn.textContent = "Submitting...";

      db.ref("reviews/" + productId).push({ name, rating, text, createdAt: new Date().toISOString() })
        .then(() => {
          showMsg("✅ Review submitted! Thank you.", "success");
          reviewForm.reset();
          selectedRating = 0; ratingInput.value = 0;
          document.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
          loadReviews();
        })
        .catch(err => { console.error(err); showMsg("Something went wrong. Try again.", "error"); })
        .finally(() => { btn.disabled = false; btn.textContent = "Submit Review"; });
    });
  }
})();
