// ═══════════════════════════════════════════════════════════════
//  admin-orders.js  –  Complete Order Management
//  Features: real-time sync, multi-filter, search, suspicious
//  detection, detail modal, shipping address, invoice
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey           : "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain       : "khakhra-5cb3d.firebaseapp.com",
  databaseURL      : "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId        : "khakhra-5cb3d",
  storageBucket    : "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId            : "1:713999821089:web:f0c25da51cff322d61b660"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── State ─────────────────────────────────────────────────────
let allOrders    = [];
let activeFilter = "all";
let searchQuery  = "";
let modalOrder   = null;

// ── DOM refs ──────────────────────────────────────────────────
const rowsEl        = document.getElementById("order-rows");
const statTotal     = document.getElementById("stat-total");
const statConfirmed = document.getElementById("stat-confirmed");
const statShipped   = document.getElementById("stat-shipped");
const statDelivered = document.getElementById("stat-delivered");
const statSuspicious= document.getElementById("stat-suspicious");
const searchInput   = document.getElementById("search-input");
const toastEl       = document.getElementById("toast");
const modalBackdrop = document.getElementById("modal-backdrop");
const orderModal    = document.getElementById("order-modal");

// ── Constants ─────────────────────────────────────────────────
const STATUS_LABEL = { 2: "Confirmed", 3: "Shipped", 4: "Delivered" };
const STATUS_ICON  = { 2: "✅", 3: "🚚", 4: "🎉" };

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = "success") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = "toast"; }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function formatINR(amount) {
  return "₹" + parseFloat(amount || 0).toFixed(2);
}

function getOrderItemFinalINR(item, order) {
  const country = order?.shippingCountry || order?.ipCountry || "IN";
  const indiaP = parseFloat(item.indiaPrice ?? item.price ?? 0) || 0;
  const intlP = parseFloat(item.internationalPrice ?? item.indiaPrice ?? item.price ?? 0) || 0;
  return parseFloat(item.finalPrice ?? (country === "IN" ? indiaP : intlP)) || 0;
}

function statusBadge(status) {
  return `<span class="status-badge status-${status}">${STATUS_ICON[status] || ""} ${STATUS_LABEL[status] || "Unknown"}</span>`;
}

function suspiciousBadge() {
  return `<span class="suspicious-badge">🛡️ Suspicious</span>`;
}

function paymentBadge(status) {
  const cls = status === "Paid" ? "pay-paid" : "pay-pending";
  return `<span class="pay-badge ${cls}">${status || "–"}</span>`;
}

function itemsPreview(items = []) {
  if (!items.length) return '<span style="color:#aaa">No items</span>';
  return items.slice(0, 2).map(i => {
    const name = escapeHtml(i.name || i.productId || "Item");
    const qty  = i.quantity || i.qty || 1;
    return `<div class="items-preview-row">${name} <strong>×${qty}</strong></div>`;
  }).join("") + (items.length > 2 ? `<div style="color:#aaa;font-size:11px">+${items.length - 2} more</div>` : "");
}

function countryFlag(code) {
  if (!code || code.length !== 2) return code || "–";
  const flags = { IN:"🇮🇳", US:"🇺🇸", GB:"🇬🇧", AE:"🇦🇪", CA:"🇨🇦", AU:"🇦🇺", SG:"🇸🇬", DE:"🇩🇪", FR:"🇫🇷" };
  return (flags[code] || "🌍") + " " + code;
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats(orders) {
  if (statTotal)      statTotal.textContent      = orders.length;
  if (statConfirmed)  statConfirmed.textContent  = orders.filter(o => o.status === 2).length;
  if (statShipped)    statShipped.textContent    = orders.filter(o => o.status === 3).length;
  if (statDelivered)  statDelivered.textContent  = orders.filter(o => o.status === 4).length;
  if (statSuspicious) statSuspicious.textContent = orders.filter(o => o.suspicious).length;
}

// ── Filter + search ───────────────────────────────────────────
function getVisibleOrders() {
  let list = allOrders;

  switch (activeFilter) {
    case "2":          list = list.filter(o => o.status === 2); break;
    case "3":          list = list.filter(o => o.status === 3); break;
    case "4":          list = list.filter(o => o.status === 4); break;
    case "suspicious": list = list.filter(o => o.suspicious);   break;
    case "india":      list = list.filter(o => o.shippingCountry === "IN"); break;
    case "intl":       list = list.filter(o => o.shippingCountry && o.shippingCountry !== "IN"); break;
    case "paid":       list = list.filter(o => o.paymentStatus === "Paid"); break;
    case "unpaid":     list = list.filter(o => o.paymentStatus !== "Paid"); break;
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(o =>
      (o.orderId || "").toLowerCase().includes(q) ||
      (o.customerName || "").toLowerCase().includes(q) ||
      (o.customerEmail || "").toLowerCase().includes(q) ||
      (o.customerPhone || "").toLowerCase().includes(q) ||
      (o.userId || "").toLowerCase().includes(q)
    );
  }

  return list;
}

// ── Render rows ───────────────────────────────────────────────
function renderRows() {
  if (!rowsEl) return;
  const list = getVisibleOrders();

  if (!list.length) {
    rowsEl.innerHTML = `
      <div class="empty-row">
        <div class="empty-icon">📦</div>
        <p>${searchQuery ? "No orders match your search." : "No orders found."}</p>
      </div>`;
    return;
  }

  rowsEl.innerHTML = list.map(o => {
    const suspClass = o.suspicious ? "order-row--suspicious" : "";
    const shortId   = (o.orderId || "").slice(0, 12) + "…";
    const customer  = escapeHtml(o.customerName || o.userId?.slice(0, 12) || "–");
    const country   = countryFlag(o.shippingCountry);
    const currency  = o.currency && o.currency !== "INR" ? ` (${o.currency})` : "";

    return `
      <div class="order-row ${suspClass}" data-order-id="${escapeHtml(o.orderId)}">
        <div class="cell-id" title="${escapeHtml(o.orderId)}">
          ${shortId}
          ${o.suspicious ? suspiciousBadge() : ""}
        </div>
        <div class="cell-customer">
          <div class="cell-customer__name">${customer}</div>
          <div class="cell-customer__phone">${escapeHtml(o.customerPhone || "")}</div>
        </div>
        <div class="cell-country">${country}${currency}</div>
        <div class="cell-items">${itemsPreview(o.items)}</div>
        <div class="cell-total">${formatINR(o.totalAmount)}</div>
        <div class="cell-payment">
          <span class="pay-method">${escapeHtml(o.paymentMethod || "–")}</span>
          ${paymentBadge(o.paymentStatus)}
        </div>
        <div>${statusBadge(o.status)}</div>
        <div>
          <select class="status-select"
                  data-order-id="${escapeHtml(o.orderId)}"
                  data-current="${o.status}"
                  onclick="event.stopPropagation()">
            <option value="2" ${o.status === 2 ? "selected" : ""}>✅ Confirmed</option>
            <option value="3" ${o.status === 3 ? "selected" : ""}>🚚 Shipped</option>
            <option value="4" ${o.status === 4 ? "selected" : ""}>🎉 Delivered</option>
          </select>
        </div>
      </div>`;
  }).join("");
}

// ── Status change (inline) ────────────────────────────────────
rowsEl?.addEventListener("change", async (e) => {
  const sel = e.target.closest(".status-select");
  if (!sel) return;

  const orderId   = sel.dataset.orderId;
  const newStatus = parseInt(sel.value);
  const oldStatus = parseInt(sel.dataset.current);
  if (newStatus === oldStatus) return;

  const row = sel.closest(".order-row");
  if (row) row.classList.add("row-saving");
  sel.disabled = true;

  try {
    await db.ref(`orders/${orderId}`).update({
      status   : newStatus,
      updatedAt: new Date().toISOString()
    });
    sel.dataset.current = newStatus;
    showToast(`Order updated to ${STATUS_LABEL[newStatus]}`, "success");
  } catch (err) {
    console.error("Status update failed:", err);
    showToast("Failed to update status.", "error");
    sel.value    = oldStatus;
  } finally {
    sel.disabled = false;
    if (row) row.classList.remove("row-saving");
  }
});

// ── Row click → modal ─────────────────────────────────────────
rowsEl?.addEventListener("click", (e) => {
  if (e.target.closest(".status-select")) return;
  const row = e.target.closest(".order-row");
  if (!row) return;
  const order = allOrders.find(o => o.orderId === row.dataset.orderId);
  if (order) openModal(order);
});

// ── Modal open ────────────────────────────────────────────────
function openModal(order) {
  modalOrder = order;

  // Order ID
  const modalOrderId = document.getElementById("modal-order-id");
  if (modalOrderId) modalOrderId.textContent = `#${order.orderId}`;

  // Suspicious banner
  const suspBanner = document.getElementById("modal-suspicious-banner");
  const suspText   = document.getElementById("modal-suspicious-text");
  if (suspBanner) {
    if (order.suspicious) {
      suspBanner.style.display = "flex";
      if (suspText) {
        suspText.textContent = `IP Country: ${order.ipCountryName || order.ipCountry || "?"} (${order.ipCountry || "?"}) | Shipping Country: ${order.shippingCountry || "?"}`;
      }
    } else {
      suspBanner.style.display = "none";
    }
  }

  // Meta grid
  const metaEl = document.getElementById("modal-meta");
  if (metaEl) {
    metaEl.innerHTML = `
      <div class="meta-item"><span class="meta-key">Date</span><span class="meta-val">${formatDate(order.confirmedAt || order.createdAt)}</span></div>
      <div class="meta-item"><span class="meta-key">Status</span><span class="meta-val">${statusBadge(order.status)}</span></div>
      <div class="meta-item"><span class="meta-key">Payment</span><span class="meta-val">${escapeHtml(order.paymentMethod || "–")}</span></div>
      <div class="meta-item"><span class="meta-key">Payment Status</span><span class="meta-val">${paymentBadge(order.paymentStatus)}</span></div>
      <div class="meta-item"><span class="meta-key">Customer</span><span class="meta-val">${escapeHtml(order.customerName || "–")}</span></div>
      <div class="meta-item"><span class="meta-key">Phone</span><span class="meta-val">${escapeHtml(order.customerPhone || "–")}</span></div>
      <div class="meta-item"><span class="meta-key">Email</span><span class="meta-val">${escapeHtml(order.customerEmail || "–")}</span></div>
      <div class="meta-item"><span class="meta-key">Currency</span><span class="meta-val">${escapeHtml(order.currency || "INR")}</span></div>
      <div class="meta-item"><span class="meta-key">IP Country</span><span class="meta-val">${countryFlag(order.ipCountry)} ${escapeHtml(order.ipCountryName || "")}</span></div>
      <div class="meta-item"><span class="meta-key">Ship Country</span><span class="meta-val">${countryFlag(order.shippingCountry)}</span></div>
      ${order.razorpayPaymentId ? `<div class="meta-item"><span class="meta-key">Razorpay ID</span><span class="meta-val" style="font-size:11px;word-break:break-all">${escapeHtml(order.razorpayPaymentId)}</span></div>` : ""}`;
  }

  // Shipping address
  const addrEl = document.getElementById("modal-address");
  if (addrEl) {
    const a = order.shippingAddress || {};
    addrEl.innerHTML = a.address1
      ? `<div class="modal-address-block">
           <div>${escapeHtml(a.address1)}</div>
           ${a.address2 ? `<div>${escapeHtml(a.address2)}</div>` : ""}
           <div>${escapeHtml(a.city || "")}${a.state ? ", " + escapeHtml(a.state) : ""} ${escapeHtml(a.postalCode || "")}</div>
           <div>${countryFlag(a.country)}</div>
         </div>`
      : `<div style="color:#aaa;font-size:13px">No address on file</div>`;
  }

  // Items table
  const itemsBody = document.getElementById("modal-items-body");
  if (itemsBody) {
    const items = order.items || [];
    itemsBody.innerHTML = items.map(i => {
      const name     = escapeHtml(i.name || i.productId || "Item");
      const qty      = i.quantity || i.qty || 1;
      const indiaP   = parseFloat(i.indiaPrice || i.price || 0);
      const intlP    = parseFloat(i.internationalPrice || i.indiaPrice || i.price || 0);
      const subtotal = getOrderItemFinalINR(i, order) * qty;
      return `<tr>
        <td>${name}</td>
        <td>${formatINR(indiaP)}</td>
        <td>${formatINR(intlP)}</td>
        <td>${qty}</td>
        <td>${formatINR(subtotal)}</td>
      </tr>`;
    }).join("");
  }

  // Totals
  const totalsEl = document.getElementById("modal-totals");
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="modal-total-row"><span>Subtotal</span><span>${formatINR(order.subtotal || order.totalAmount)}</span></div>
      <div class="modal-total-row"><span>Shipping</span><span>Free</span></div>
      <div class="modal-total-row modal-total-row--grand"><span>Grand Total</span><span>${formatINR(order.totalAmount)}</span></div>`;
  }

  // Status select
  const statusSel = document.getElementById("modal-status-select");
  if (statusSel) statusSel.value = order.status;

  // Open modal
  modalBackdrop?.classList.add("open");
  orderModal?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalBackdrop?.classList.remove("open");
  orderModal?.classList.remove("open");
  document.body.style.overflow = "";
  modalOrder = null;
}

document.getElementById("modal-close")?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ── Modal status update ───────────────────────────────────────
document.getElementById("modal-status-btn")?.addEventListener("click", async () => {
  if (!modalOrder) return;
  const sel       = document.getElementById("modal-status-select");
  const newStatus = parseInt(sel?.value);
  const btn       = document.getElementById("modal-status-btn");

  if (!newStatus || newStatus === modalOrder.status) {
    showToast("Status unchanged.", "info");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }

  try {
    await db.ref(`orders/${modalOrder.orderId}`).update({
      status   : newStatus,
      updatedAt: new Date().toISOString()
    });
    showToast(`Order updated to ${STATUS_LABEL[newStatus]}`, "success");
  } catch (err) {
    console.error("Modal status update failed:", err);
    showToast("Failed to update status.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Update"; }
  }
});

// ── Invoice button ────────────────────────────────────────────
document.getElementById("modal-invoice-btn")?.addEventListener("click", () => {
  if (!modalOrder) return;
  if (typeof generateInvoice === "function") {
    generateInvoice(modalOrder);
  } else {
    console.error("invoice.js not loaded");
    showToast("Invoice generator not available.", "error");
  }
});

// ── Filter buttons ────────────────────────────────────────────
document.getElementById("filter-group")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.filter;
  renderRows();
});

// ── Search ────────────────────────────────────────────────────
searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderRows();
});

// ── Real-time Firebase listener ───────────────────────────────
db.ref("orders").on("value", (snap) => {
  allOrders = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const o = child.val();
      if (o && o.status >= 2) {
        allOrders.push({ orderId: child.key, ...o });
      }
    });
  }

  // Sort newest first
  allOrders.sort((a, b) =>
    new Date(b.confirmedAt || b.createdAt || 0) -
    new Date(a.confirmedAt || a.createdAt || 0)
  );

  updateStats(allOrders);
  renderRows();

  // Keep open modal in sync
  if (modalOrder) {
    const updated = allOrders.find(o => o.orderId === modalOrder.orderId);
    if (updated) openModal(updated);
  }
});
