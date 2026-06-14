// prod.js — Firebase product fetch + shared localStorage cart

function getQtyInCart(productId) {
  const item = getCartItem(productId);
  return item ? item.quantity : 0;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function renderAddBtn(wrapper, isAvailable = true) {
  wrapper.innerHTML = isAvailable
    ? `<button class="card-btn">Add to cart</button>`
    : `<button class="card-btn card-btn-disabled" disabled>Out of Stock</button>`;
}

function renderQtySelector(wrapper, qty, isAvailable = true) {
  wrapper.innerHTML = `
    <div class="qty-selector">
      <button class="qty-btn qty-minus">−</button>
      <span class="qty-count">${qty}</span>
      <button class="qty-btn qty-plus" ${isAvailable ? "" : "disabled"}>+</button>
    </div>`;
}

async function refreshProductCardPrices() {
  if (typeof formatProductPrice !== "function") return;

  const cards = Array.from(document.querySelectorAll(".product-card"));
  await Promise.all(cards.map(async (card) => {
    const priceEl = card.querySelector(".card-subtitle");
    if (!priceEl) return;

    const indiaPrice = parseFloat(card.dataset.indiaPrice || card.dataset.price || "0") || 0;
    if (indiaPrice <= 0) return;

    const internationalPrice = parseFloat(card.dataset.internationalPrice || card.dataset.price || "0") || indiaPrice;
    const displayPrice = await formatProductPrice({ indiaPrice, internationalPrice });
    priceEl.textContent = displayPrice;
  }));
}

// ── Page init ─────────────────────────────────────────────────────────────────
(function () {
  const categoryId = new URLSearchParams(window.location.search).get("category");
  console.log("🔍 categoryId:", categoryId);

  if (!categoryId) {
    console.warn("⚠️ No category param. Use ?category=cat1");
    return;
  }

  const titleEl   = document.getElementById("hero-title");
  const descEl    = document.getElementById("hero-desc");
  const container = document.getElementById("products-container");
  const renderCartState = () => {
    document.querySelectorAll(".product-card").forEach(card => {
      const qty = getQtyInCart(card.dataset.id);
      const action = card.querySelector(".card-action");
      if (!action) return;
      const isAvailable = card.dataset.available !== "false";
      action.innerHTML = qty > 0 ? `<div class="qty-selector">
        <button class="qty-btn qty-minus">−</button>
        <span class="qty-count">${qty}</span>
        <button class="qty-btn qty-plus" ${isAvailable ? "" : "disabled"}>+</button>
      </div>` : (isAvailable
        ? `<button class="card-btn">Add to cart</button>`
        : `<button class="card-btn card-btn-disabled" disabled>Out of Stock</button>`);
    });
  };

  // Category banner
  db.ref("categories/" + categoryId).once("value")
    .then(snapshot => {
      const cat = snapshot.val();
      if (!cat) return;
      if (titleEl) titleEl.textContent = cat.name || "";
      if (descEl)  descEl.textContent  = cat.desc || cat.description || "";
    })
    .catch(err => console.error("❌ Category fetch error:", err));

  // Products
  db.ref("products").once("value")
    .then(snapshot => {
      if (!snapshot.exists() || !container) return;

      container.innerHTML = "";
      let count = 0;

      snapshot.forEach(child => {
        const p = child.val();
        if (p.categoryId !== categoryId) return;
        count++;

        const id    = child.key;
        const img   = p.image || "";
        const title = p.title || p.name || "";
        const price = typeof resolveIndiaPrice === "function"
          ? resolveIndiaPrice(p)
          : (p.indiaPrice || p.price || 0);
        const internationalPrice = typeof resolveInternationalPrice === "function"
          ? resolveInternationalPrice(p)
          : (p.internationalPrice || price);
        const qty   = getQtyInCart(id);
        const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;

        const btnHTML = qty > 0
          ? `<div class="qty-selector">
               <button class="qty-btn qty-minus">−</button>
               <span class="qty-count">${qty}</span>
               <button class="qty-btn qty-plus" ${isAvailable ? "" : "disabled"}>+</button>
             </div>`
          : (isAvailable
              ? `<button class="card-btn">Add to cart</button>`
              : `<button class="card-btn card-btn-disabled" disabled>Out of Stock</button>`);

        container.innerHTML += `
          <div class="product-card" data-id="${id}" data-name="${title}" data-price="${price}" data-image="${img}" data-available="${isAvailable}" data-india-price="${price}" data-international-price="${internationalPrice}">
            <div class="card-img-wrap">
              <img src="${img}" alt="${title}" />
            </div>
            <div class="card-body">
              <div class="card-info">
                <div class="card-title">${title}</div>
                <div class="card-subtitle">${price ? "₹" + price : "View all products"}</div>
              </div>
              <div class="card-action">${btnHTML}</div>
            </div>
          </div>`;
      });

      if (count === 0) console.warn("⚠️ No products for categoryId:", categoryId);
      refreshProductCardPrices();
    })
    .catch(err => console.error("❌ Products fetch error:", err));

  // ── Event delegation on container ──────────────────────────────────────────
  document.addEventListener("click", function (e) {
    // Add to cart
    if (e.target.classList.contains("card-btn")) {
      const card   = e.target.closest(".product-card");
      if (!card) return;
      if (card.dataset.available === "false") return;
      const id     = card.dataset.id;
      const name   = card.dataset.name;
      const price  = parseFloat(card.dataset.indiaPrice || card.dataset.price) || 0;
      const indiaPrice = price;
      const internationalPrice = parseFloat(card.dataset.internationalPrice || card.dataset.indiaPrice || card.dataset.price) || price;
      const image  = card.dataset.image;

      const qty = addToCart({ id, name, price, indiaPrice, internationalPrice, image, quantity: 1 });
      renderQtySelector(card.querySelector(".card-action"), qty, true);
      return;
    }

    // Plus
    if (e.target.classList.contains("qty-plus")) {
      const card   = e.target.closest(".product-card");
      if (!card) return;
      if (card.dataset.available === "false") return;
      const id     = card.dataset.id;
      const qty    = increaseQuantity(id);
      card.querySelector(".qty-count").textContent = qty;
      return;
    }

    // Minus
    if (e.target.classList.contains("qty-minus")) {
      const card   = e.target.closest(".product-card");
      if (!card) return;
      const id     = card.dataset.id;
      const qty    = decreaseQuantity(id);
      if (qty === 0) {
        renderAddBtn(card.querySelector(".card-action"), card.dataset.available !== "false");
      } else {
        card.querySelector(".qty-count").textContent = qty;
      }
      return;
    }

    const card = e.target.closest(".product-card");
    if (card && card.dataset.id) {
      location.href = "/product-detail?id=" + card.dataset.id;
    }
  });

  window.addEventListener("cart-updated", renderCartState);
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === "cart") renderCartState();
  });
  window.addEventListener("pricing-ready", refreshProductCardPrices);
})();
