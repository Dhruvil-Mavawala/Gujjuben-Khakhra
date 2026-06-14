// cart.js – Cart page backed by shared localStorage cart

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

// Session guard — validate user object has required id field
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user || !user.id) {
  console.warn("⚠️ No valid session found. Redirecting to login.");
  window.location.href = "/login";
}

let currentItems   = [];
let productAvailabilityMap = {};
let productPricingMap = {};

const container  = document.getElementById("cart-items-container");
const checkoutEl = document.getElementById("cart-checkout");
const subtotalEl = document.getElementById("subtotal-value");

function getPricingForItem(item) {
  const mapped = productPricingMap[item.id] || {};
  const indiaPrice = parseFloat(mapped.indiaPrice ?? item.indiaPrice ?? item.price) || 0;
  const internationalPrice = parseFloat(mapped.internationalPrice ?? item.internationalPrice ?? indiaPrice) || indiaPrice;
  return { indiaPrice, internationalPrice };
}

function getCurrentCountryCode() {
  return String(window.userCountryCode || "IN").toUpperCase();
}

function getCurrentCurrency() {
  return String(window.userCurrency || "INR").toUpperCase();
}

function getItemBasePriceINR(item) {
  const pricing = getPricingForItem(item);
  const product = { indiaPrice: pricing.indiaPrice, internationalPrice: pricing.internationalPrice };
  return typeof getBasePrice === "function"
    ? getBasePrice(product, getCurrentCountryCode())
    : (getCurrentCountryCode() === "IN" ? pricing.indiaPrice : pricing.internationalPrice);
}

function getCartTotalINR(items = currentItems) {
  return (items || []).reduce((sum, item) => sum + getItemBasePriceINR(item) * item.quantity, 0);
}

async function formatCartDisplayAmount(baseAmountINR) {
  if (typeof initPricing === "function") await initPricing();

  const currency = getCurrentCurrency();
  if (currency === "INR" || typeof convertCurrency !== "function" || typeof formatCurrencyAmount !== "function") {
    const inr = parseFloat(baseAmountINR) || 0;
    return "\u20b9" + inr.toFixed(2);
  }

  const converted = convertCurrency(parseFloat(baseAmountINR) || 0, currency);
  return formatCurrencyAmount(converted, currency);
}

async function renderCart(items) {
  currentItems = items || [];
  if (!container) return;

  if (currentItems.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <span class="empty-cart-icon">🛒</span>
        <div class="empty-cart-title">Your cart is empty</div>
        <p class="empty-cart-sub">Looks like you haven't added anything yet. Explore our authentic Gujarati snacks!</p>
        <a class="empty-cart-btn" href="/productlist">Start Shopping</a>
      </div>`;
    if (checkoutEl) checkoutEl.style.display = "none";
    return;
  }

  const rowDisplay = await Promise.all(currentItems.map(async (item) => {
    const basePrice = getItemBasePriceINR(item);
    const unitDisplay = await formatCartDisplayAmount(basePrice);
    const rowDisplay = await formatCartDisplayAmount(basePrice * item.quantity);
    return { unitDisplay, rowDisplay };
  }));

  container.innerHTML = currentItems.map((item, index) => `
    <div class="cart-row" data-id="${item.id}">
      <div class="frame-5503">
        <div class="frame-5504">
          <img class="cart-item-img" src="${item.image || ''}" alt="${item.name}"
               onerror="this.style.background='#f0f0f0';this.src='';" />
        </div>
        <div class="frame-5505">
          <div class="gujjuben-s-khakhra">${item.name}</div>
          <div class="remove" style="cursor:pointer;color:#e53935;font-size:13px;margin-top:4px;">Remove</div>
        </div>
      </div>
      <div class="row-price">${rowDisplay[index].unitDisplay}</div>
      <div class="frame-5506">
        <button class="qty-ctrl-btn qty-minus">-</button>
        <span class="qty-display">${item.quantity}</span>
        <button class="qty-ctrl-btn qty-plus" ${productAvailabilityMap[item.id] === false ? "disabled" : ""}>+</button>
      </div>
      <div class="row-total">${rowDisplay[index].rowDisplay}</div>
    </div>`
  ).join("");

  if (subtotalEl) {
    subtotalEl.textContent = await formatCartDisplayAmount(getCartTotalINR(currentItems));
  }
  if (checkoutEl) checkoutEl.style.display = "flex";
}

async function loadCart() {
  try {
    productAvailabilityMap = {};
    productPricingMap = {};
    if (typeof db !== "undefined") {
      const snap = await db.ref("products").once("value");
      snap.forEach(child => {
        const product = child.val() || {};
        productAvailabilityMap[child.key] = typeof isProductAvailable === "function"
          ? isProductAvailable(product)
          : true;

        const indiaPrice = typeof resolveIndiaPrice === "function"
          ? resolveIndiaPrice(product)
          : (parseFloat(product.indiaPrice ?? product.price) || 0);
        const internationalPrice = typeof resolveInternationalPrice === "function"
          ? resolveInternationalPrice(product)
          : (parseFloat(product.internationalPrice) || indiaPrice);

        productPricingMap[child.key] = { indiaPrice, internationalPrice };
      });
    }
  } catch (err) {
    console.error("❌ Availability load error:", err);
  }

  await renderCart(getCart());
}

document.addEventListener("click", async function (e) {
  if (e.target.closest("#checkout-btn")) {
    if (currentItems.length === 0) return;
    window.location.href = "/checkout";
    return;
  }

  const row = e.target.closest(".cart-row");
  if (!row) return;
  const productId = row.dataset.id;

  if (e.target.classList.contains("qty-plus")) {
    if (productAvailabilityMap[productId] === false) return;
    increaseQuantity(productId);
    loadCart();
  }
  if (e.target.classList.contains("qty-minus")) {
    decreaseQuantity(productId);
    loadCart();
  }
  if (e.target.classList.contains("remove")) {
    removeFromCart(productId);
    loadCart();
  }
});

function buildOrderItems() {
  return getCart().map((item) => ({
    productId: item.id,
    name: item.name,
    price: getItemBasePriceINR(item),
    indiaPrice: getPricingForItem(item).indiaPrice,
    internationalPrice: getPricingForItem(item).internationalPrice,
    finalPrice: getItemBasePriceINR(item),
    image: item.image,
    quantity: item.quantity,
  }));
}

async function createOrderFromCart(paymentMethod, paymentStatus, razorpayPaymentId) {
  const items = buildOrderItems();
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const ref = db.ref("orders").push();

  await ref.set({
    userId: user.id,
    items,
    subtotal: total,
    shipping: 0,
    totalAmount: total,
    currency: getCurrentCurrency(),
    ipCountry: getCurrentCountryCode(),
    shippingCountry: getCurrentCountryCode(),
    status: 2,
    paymentMethod,
    paymentStatus,
    razorpayPaymentId: razorpayPaymentId || null,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  });

  saveCart([]);
  loadCart();
  return ref.key;
}

async function showPaymentModal() {
  document.getElementById("payment-modal")?.remove();
  const orderTotalINR = getCartTotalINR(currentItems);
  const displayTotal = await formatCartDisplayAmount(orderTotalINR);

  const modal = document.createElement("div");
  modal.id = "payment-modal";
  modal.innerHTML = `
    <div class="pm-backdrop"></div>
    <div class="pm-card">
      <h3 class="pm-title">Choose Payment Method</h3>
      <p class="pm-amount">Total: <strong>${displayTotal}</strong></p>
      <p class="pm-amount">Shipping: <strong>Free</strong></p>
      <div class="pm-btns">
        <button class="pm-btn pm-cod">💵 Cash on Delivery</button>
        <button class="pm-btn pm-online">💳 Pay Online</button>
      </div>
      <button class="pm-close">✕ Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector(".pm-backdrop").addEventListener("click", () => modal.remove());
  modal.querySelector(".pm-close").addEventListener("click",    () => modal.remove());

  modal.querySelector(".pm-cod").addEventListener("click", async () => {
    modal.remove();
    await createOrderFromCart("COD", "Pending");
    window.location.href = "/order-success";
  });

  modal.querySelector(".pm-online").addEventListener("click", () => {
    modal.remove();
    launchRazorpay(orderTotalINR);
  });
}

function launchRazorpay(total) {
  const API = window.APP_CONFIG?.API_BASE_URL;
  const razorpayKey = window.APP_CONFIG?.RAZORPAY_KEY_ID;

  if (!API) {
    alert("Payment configuration missing. Please use COD.");
    return;
  }

  if (!razorpayKey) {
    alert("Payment configuration missing. Please use COD.");
    return;
  }

  // ── STEP 1: Create Razorpay order on backend ──────────────────
  fetch(`${API}/create-order`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ amount: total, amountPaise: Math.round(total * 100) }),
  })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok || !data.success || !data.order?.id) {
        throw new Error(data.error || "Could not create payment order.");
      }

      const rzpOrder = data.order;
      console.log("[Cart] Razorpay order created:", rzpOrder.id);

      // ── STEP 2: Open Razorpay checkout ────────────────────────
      const options = {
        key      : razorpayKey,
        order_id : rzpOrder.id,
        amount   : rzpOrder.amount,
        currency : rzpOrder.currency,
        name     : "Gujjuben's Khakhra",
        description: "Order Payment",
        image    : "/assets/images/union0.svg",
        prefill  : {
          name   : user.username || "",
          email  : user.email    || "",
          contact: user.phone    || "",
        },
        theme: { color: "#e53935" },

        // ── STEP 3: Verify then create Firebase order ─────────
        handler: async function (response) {
          const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = response;

          // Verify on backend first
          try {
            const verifyRes = await fetch(`${API}/verify-payment`, {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              throw new Error(verifyData.error || "Payment verification failed.");
            }
            console.log("[Cart] Payment verified:", razorpay_payment_id);
          } catch (err) {
            console.error("[Cart] Verification failed:", err);
            alert("Payment received but verification failed. Contact support. Payment ID: " + razorpay_payment_id);
            return;
          }

          // ── STEP 4: Only after verified — create Firebase order
          await createOrderFromCart("ONLINE", "Paid", razorpay_payment_id);
          window.location.href = "/order-success";
        },

        modal: { ondismiss: () => console.log("[Cart] Payment cancelled.") }
      };

      new Razorpay(options).open();
    })
    .catch(err => {
      console.error("[Cart] create-order failed:", err);
      alert("Payment unavailable: " + err.message + ". Please use COD.");
    });
}

window.addEventListener("cart-updated", loadCart);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "cart") loadCart();
});
window.addEventListener("pricing-ready", () => {
  renderCart(getCart());
});

loadCart();
