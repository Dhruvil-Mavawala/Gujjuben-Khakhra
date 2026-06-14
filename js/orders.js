// ─────────────────────────────────────────────────────────────────────────────
//  orders.js  –  My Orders page
//  Reads from Firebase: orders node, filtered by userId
//  Status: 1=Cart  2=Confirmed  3=Shipped  4=Delivered
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth guard ────────────────────────────────────────────────────────────────
const _user = JSON.parse(localStorage.getItem("user") || "null");
if (!_user || !_user.id) {
  window.location.href = "/login";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  2: { label: "Confirmed", icon: "✅", cls: "status-2" },
  3: { label: "Shipped",   icon: "🚚", cls: "status-3" },
  4: { label: "Delivered", icon: "🎉", cls: "status-4" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function statusBadgeHTML(status) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return `<span class="status-badge status-cancelled">Cancelled</span>`;
  return `<span class="status-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>`;
}

function itemsPreviewText(items = []) {
  if (!items.length) return "No items";
  return items.slice(0, 2).map(i => i.name).join(", ");
}

function getOrderItemUnitINR(item) {
  return parseFloat(item.finalPrice ?? item.price ?? item.indiaPrice ?? 0) || 0;
}

async function formatOrderAmount(inrAmount) {
  const amount = parseFloat(inrAmount) || 0;
  if (typeof initPricing === "function") {
    await initPricing();
  }

  if (typeof convertCurrency !== "function" || typeof formatCurrencyAmount !== "function") {
    return "₹" + amount.toFixed(2);
  }

  const currency = typeof window.userCurrency === "string" ? window.userCurrency.toUpperCase() : "INR";
  if (currency === "INR") {
    return "₹" + amount.toFixed(2);
  }

  const converted = convertCurrency(amount, currency);
  return formatCurrencyAmount(converted, currency);
}

// ── State ─────────────────────────────────────────────────────────────────────
let allOrders   = [];   // full list fetched from Firebase
let activeFilter = "all";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const ordersContainer = document.getElementById("orders-container");
const emptyState      = document.getElementById("empty-orders");
const filterTabs      = document.getElementById("filter-tabs");
const modal           = document.getElementById("order-modal");
const modalClose      = document.getElementById("modal-close");

// ── Load orders from Firebase ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // firebase.js already initialised the app — reuse the global `db`
  if (typeof db === "undefined") {
    showError("Firebase not initialised.");
    return;
  }

  try {
    const snap = await db.ref("orders")
      .orderByChild("userId")
      .equalTo(_user.id)
      .once("value");

    allOrders = [];

    if (snap.exists()) {
      snap.forEach(child => {
        const o = child.val();
        // Only show confirmed+ orders (status >= 2); skip cart items (status 1)
        if (o.status >= 2) {
          allOrders.push({ orderId: child.key, ...o });
        }
      });
    }

    // Newest first
    allOrders.sort((a, b) =>
      new Date(b.confirmedAt || b.createdAt || 0) -
      new Date(a.confirmedAt || a.createdAt || 0)
    );

    renderOrders(allOrders);
  } catch (err) {
    console.error("Error loading orders:", err);
    showError("Could not load orders. Please try again.");
  }
});

// ── Render ────────────────────────────────────────────────────────────────────
async function renderOrders(orders) {
  if (!ordersContainer) return;

  if (orders.length === 0) {
    ordersContainer.innerHTML = "";
    emptyState.style.display  = "block";
    return;
  }

  emptyState.style.display = "none";

  const cards = await Promise.all(orders.map(async (o, idx) => {
    const items    = o.items || [];
    const preview  = itemsPreviewText(items);
    const extra    = items.length > 2 ? `+${items.length - 2} more` : "";
    const total    = await formatOrderAmount(o.totalAmount || 0);
    const date     = formatDate(o.confirmedAt || o.createdAt);

    return `
      <div class="order-card" data-order-id="${o.orderId}" style="animation-delay:${idx * 0.05}s">

        <div class="order-info">
          <div class="order-id-label">Order ID</div>
          <div class="order-id-value">#${o.orderId.slice(-8).toUpperCase()}</div>
          <div class="order-date">${date}</div>
        </div>

        <div class="order-items-col">
          <div class="order-items-preview">${preview}</div>
          ${extra ? `<span class="order-items-count">${extra}</span>` : ""}
        </div>

        <div class="order-right">
          ${statusBadgeHTML(o.status)}
          <div class="order-total">${total}</div>
          <button class="view-details-btn" data-order-id="${o.orderId}">View Details</button>
        </div>

      </div>`;
  }));

  ordersContainer.innerHTML = cards.join("");
}

function showError(msg) {
  if (!ordersContainer) return;
  ordersContainer.innerHTML = `
    <div class="empty-state" style="display:block">
      <div class="empty-icon">⚠️</div>
      <h2 class="empty-title">Something went wrong</h2>
      <p class="empty-sub">${msg}</p>
    </div>`;
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
if (filterTabs) {
  filterTabs.addEventListener("click", e => {
    const btn = e.target.closest(".filter-tab");
    if (!btn) return;

    filterTabs.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    activeFilter = btn.dataset.filter;
    const filtered = activeFilter === "all"
      ? allOrders
      : allOrders.filter(o => String(o.status) === activeFilter);

    renderOrders(filtered);
  });
}

// ── View Details → open modal ─────────────────────────────────────────────────
document.addEventListener("click", e => {
  const btn = e.target.closest(".view-details-btn");
  if (!btn) return;

  const orderId = btn.dataset.orderId;
  const order   = allOrders.find(o => o.orderId === orderId);
  if (!order) return;

  openModal(order);
});

// ── Modal logic ───────────────────────────────────────────────────────────────
function openModal(order) {
  if (!modal) return;

  // Header
  document.getElementById("modal-order-id").textContent =
    `#${order.orderId.slice(-8).toUpperCase()}`;

  // Meta
  document.getElementById("modal-date").textContent =
    formatDate(order.confirmedAt || order.createdAt);

  const payMethod = order.paymentMethod || "—";
  const payStatus = order.paymentStatus || "—";
  document.getElementById("modal-payment").textContent = `${payMethod} · ${payStatus}`;

  const statusCfg = STATUS_CONFIG[order.status];
  document.getElementById("modal-status").innerHTML =
    statusCfg
      ? `<span class="status-badge ${statusCfg.cls}">${statusCfg.icon} ${statusCfg.label}</span>`
      : `<span class="status-badge status-cancelled">Cancelled</span>`;

  // Stepper
  [2, 3, 4].forEach(step => {
    const el = document.getElementById(`mstep-${step}`);
    if (!el) return;
    el.classList.remove("done", "active");
    if (order.status > step)  el.classList.add("done");
    if (order.status === step) el.classList.add("active");
  });

  // Items
  const items = order.items || [];
  document.getElementById("modal-items").innerHTML = items.map(item => `
    <div class="modal-item">
      <img class="modal-item-img"
           src="${item.image || ''}"
           alt="${item.name}"
           onerror="this.style.background='#f0f0f0';this.removeAttribute('src');" />
      <div class="modal-item-info">
        <div class="modal-item-name">${item.name}</div>
        <div class="modal-item-qty">Qty: ${item.quantity}</div>
      </div>
      <div class="modal-item-price" data-item-total="${(getOrderItemUnitINR(item) * item.quantity).toFixed(2)}">₹${(getOrderItemUnitINR(item) * item.quantity).toFixed(2)}</div>
    </div>`
  ).join("");

  // Total
  document.getElementById("modal-total").textContent = `₹${parseFloat(order.totalAmount || 0).toFixed(2)}`;

  Promise.all(Array.from(document.querySelectorAll("#modal-items .modal-item-price")).map(async (priceEl) => {
    const amount = parseFloat(priceEl.dataset.itemTotal || "0") || 0;
    priceEl.textContent = await formatOrderAmount(amount);
  })).then(async () => {
    document.getElementById("modal-total").textContent = await formatOrderAmount(order.totalAmount || 0);
  }).catch(() => {
    document.getElementById("modal-total").textContent = `₹${parseFloat(order.totalAmount || 0).toFixed(2)}`;
  });

  // Show
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";
}

if (modalClose) modalClose.addEventListener("click", closeModal);

// Close on backdrop click
if (modal) {
  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });
}

// Close on Escape key
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

window.addEventListener("pricing-ready", () => {
  const filtered = activeFilter === "all"
    ? allOrders
    : allOrders.filter(o => String(o.status) === activeFilter);
  renderOrders(filtered);
});
