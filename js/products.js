// products.js – Product listing + shared localStorage cart
// No ?category  → category listing
// ?category=id  → product grid for that category
// NOTE: Firebase is initialised by firebase.js (loaded before this script).
//       `db` is already available globally — do NOT re-declare it here.

// Session — read from localStorage (written by login.js / otp.js)
const _sessionUser = JSON.parse(localStorage.getItem("user") || "null");
if (_sessionUser) {
  console.log("✅ Session active:", _sessionUser.username, "| id:", _sessionUser.id);
} else {
  console.log("ℹ️ No session — guest browsing (cart actions will redirect to login)");
}

function addBtnHTML(isAvailable = true) {
  return isAvailable
    ? `<button class="prod-card-btn">Add to cart</button>`
    : `<button class="prod-card-btn prod-card-btn-disabled" disabled>Out of Stock</button>`;
}

function qtySelectorHTML(qty, isAvailable = true) {
  return `<div class="qty-selector">
    <button class="qty-btn qty-minus">−</button>
    <span class="qty-count">${qty}</span>
    <button class="qty-btn qty-plus" ${isAvailable ? "" : "disabled"}>+</button>
  </div>`;
}

function cartQtyFor(productId) {
  const item = getCartItem(productId);
  return item ? item.quantity : 0;
}

function renderCardAction(card) {
  const productId = card.dataset.id;
  const isAvailable = card.dataset.available !== "false";
  const qty = cartQtyFor(productId);
  const action = card.querySelector(".prod-card-right");
  if (!action) return;
  action.innerHTML = qty > 0 ? qtySelectorHTML(qty, isAvailable) : addBtnHTML(isAvailable);
}

function syncGridCartState() {
  document.querySelectorAll(".prod-card").forEach(renderCardAction);
}

async function refreshGridPrices() {
  if (typeof formatProductPrice !== "function") return;

  const cards = Array.from(document.querySelectorAll(".prod-card"));
  await Promise.all(cards.map(async (card) => {
    const subEl = card.querySelector(".prod-card-sub");
    if (!subEl) return;

    const indiaPrice = parseFloat(card.dataset.indiaPrice || card.dataset.price || "0") || 0;
    if (indiaPrice <= 0) return;

    const internationalPrice = parseFloat(card.dataset.internationalPrice || card.dataset.price || "0") || indiaPrice;
    const displayPrice = await formatProductPrice({ indiaPrice, internationalPrice });
    subEl.textContent = displayPrice;
  }));
}

(async function () {
  const categoryId    = new URLSearchParams(window.location.search).get("category");
  const listContainer = document.getElementById("categories-container");
  const gridContainer = document.getElementById("products-grid");
  const titleEl       = document.querySelector(".products-category");
  const subtitleEl    = document.querySelector(
    ".at-gujjubens-we-specialize-in-authentic-gujarati-snacks-that-are-perfect-for-every-occasion-from-daily-snacking-to-festive-treats"
  );
  const descClass = "prepared-under-hygienic-conditions-and-packed-to-retain-freshness-khakhra-combines-authentic-taste-nutrition-and-convenience-its-long-shelf-life-and-ready-to-eat-nature-make-it-an-ideal-choice-for-people-seeking-a-healthy-tasty-and-fast-snack-without-compromising-on-quality-or-tradition";

  // ── MODE A: product grid ──────────────────────
  if (categoryId) {
    db.ref("categories/" + categoryId).once("value").then(snap => {
      const cat = snap.val();
      if (!cat) return;
      if (titleEl)    titleEl.textContent    = cat.name || "";
      if (subtitleEl) subtitleEl.textContent = cat.desc || cat.description || "";
    });

    const snapshot = await db.ref("products").once("value");
    if (!snapshot.exists() || !gridContainer) return;

    gridContainer.innerHTML = "";
    let count = 0;

    snapshot.forEach(child => {
      const p = child.val();
      if (p.categoryId !== categoryId) return;
      count++;
      const productId = child.key;
      const img   = p.image || "";
      const name  = p.name  || p.title || "";
      const price = typeof resolveIndiaPrice === "function"
        ? resolveIndiaPrice(p)
        : (p.indiaPrice || p.price || 0);
      const internationalPrice = typeof resolveInternationalPrice === "function"
        ? resolveInternationalPrice(p)
        : (p.internationalPrice || price);
      const qty   = cartQtyFor(productId);
      const isAvailable = typeof isProductAvailable === "function" ? isProductAvailable(p) : true;

      gridContainer.innerHTML += `
        <div class="prod-card" data-id="${productId}" data-name="${name}" data-price="${price}" data-image="${img}" data-available="${isAvailable}" data-india-price="${price}" data-international-price="${internationalPrice}">
          <div class="prod-card-img-wrap">
            <img class="prod-card-img" src="${img}" alt="${name}" />
          </div>
          <div class="prod-card-body">
            <div class="prod-card-left">
              <div class="prod-card-title">${name}</div>
              <div class="prod-card-sub">${price ? "₹" + price : "View Details"}</div>
            </div>
            <div class="prod-card-right">
              ${qty > 0 ? qtySelectorHTML(qty, isAvailable) : addBtnHTML(isAvailable)}
            </div>
          </div>
        </div>`;
    });

    if (count > 0) {
      gridContainer.classList.add("active");
      if (listContainer) listContainer.style.display = "none";
      refreshGridPrices();
    }
    return;
  }

  // ── MODE B: category listing ──────────────────
  if (!listContainer) return;

  const snapshot = await db.ref("categories").once("value");
  if (!snapshot.exists()) return;

  listContainer.innerHTML = "";
  let index = 0;

  snapshot.forEach(child => {
    const cat  = child.val();
    const img  = cat.image || "";
    const name = cat.name  || "";
    const desc = cat.desc  || cat.description || "";
    const link = "/productlist?category=" + child.key;

    const imageEl = `<img class="rectangle-22" src="${img}" alt="${name}" />`;
    const textEl  = `
      <div class="frame-21">
        <div class="khakhra">${name}</div>
        <div class="frame-5434">
          <div class="about-our-product">About Our Product</div>
          <div class="${descClass}">${desc}</div>
          <div class="button-main">
            <div class="frame-1">
              <div class="component-2-primary-button2" onclick="location.href='${link}'" style="cursor:pointer">
                <div class="button">Shop Now</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const frameClass = index % 2 === 0 ? "frame-23" : "frame-54772";
    const inner      = index % 2 === 0 ? imageEl + textEl : textEl + imageEl;
    listContainer.innerHTML += `<div class="${frameClass}">${inner}</div>`;
    index++;
  });
})();

// ── Event delegation – all cart interactions ──
document.addEventListener("click", async function (e) {

  // "Add to cart"
    if (e.target.classList.contains("prod-card-btn")) {
    e.stopPropagation();
    if (!_sessionUser) { location.href = "/login"; return; }

    const card = e.target.closest(".prod-card");
    if (!card) return;
    if (card.dataset.available === "false") return;

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Adding…";

    const productId = card.dataset.id;
    const product   = {
      productId,
      name    : card.dataset.name,
      price   : parseFloat(card.dataset.indiaPrice || card.dataset.price) || 0,
      indiaPrice: parseFloat(card.dataset.indiaPrice || card.dataset.price) || 0,
      internationalPrice: parseFloat(card.dataset.internationalPrice || card.dataset.indiaPrice || card.dataset.price) || 0,
      image   : card.dataset.image,
      quantity: 1
    };

    const qty = addToCart(product);
    card.querySelector(".prod-card-right").innerHTML = qtySelectorHTML(qty);
    if (typeof showToast === "function") showToast("Added to cart! 🛒", "success");
    return;
  }

  // "+" button
  if (e.target.classList.contains("qty-plus")) {
    e.stopPropagation();
    if (!_sessionUser) return;

    const card = e.target.closest(".prod-card");
    if (!card) return;
    if (card.dataset.available === "false") return;

    const productId = card.dataset.id;
    const qty = increaseQuantity(productId);
    card.querySelector(".qty-count").textContent = qty;
    return;
  }

  // "−" button
  if (e.target.classList.contains("qty-minus")) {
    e.stopPropagation();
    if (!_sessionUser) return;

    const card = e.target.closest(".prod-card");
    if (!card) return;

    const productId = card.dataset.id;
    const qty = decreaseQuantity(productId);

    if (qty === 0) {
      card.querySelector(".prod-card-right").innerHTML = addBtnHTML(card.dataset.available !== "false");
    } else {
      card.querySelector(".qty-count").textContent = qty;
    }
    return;
  }

  // Card click → product detail
  const card = e.target.closest(".prod-card");
  if (card && card.dataset.id) {
    location.href = "/product-detail?id=" + card.dataset.id;
  }
});

window.addEventListener("cart-updated", syncGridCartState);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "cart") syncGridCartState();
});
window.addEventListener("pricing-ready", refreshGridPrices);
