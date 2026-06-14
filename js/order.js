// order.js – Shared Firebase cart/order helpers
// Status: 1=Cart  2=Confirmed  3=Shipped  4=Delivered

const ORDER_STATUS = { CART: 1, CONFIRMED: 2, SHIPPED: 3, DELIVERED: 4 };

function getCurrentUser() {
  return JSON.parse(localStorage.getItem("user") || "null");
}

function getOrderCountryCode() {
  return String(window.userCountryCode || "IN").toUpperCase();
}

function getOrderItemUnit(item) {
  if (typeof getBasePrice === "function") {
    return getBasePrice(item, getOrderCountryCode());
  }
  const indiaPrice = parseFloat(item.indiaPrice ?? item.price ?? 0) || 0;
  const internationalPrice = parseFloat(item.internationalPrice ?? item.indiaPrice ?? item.price ?? 0) || indiaPrice;
  return getOrderCountryCode() === "IN" ? indiaPrice : internationalPrice;
}

function calculateItemsTotal(items) {
  return (items || []).reduce((s, i) => s + getOrderItemUnit(i) * (i.quantity || 1), 0);
}

// Returns { orderId, order } or null
async function getActiveCart(db, userId) {
  const snap = await db.ref("orders")
    .orderByChild("userId").equalTo(userId).once("value");
  if (!snap.exists()) return null;
  let cartOrderId = null, cartOrder = null;
  snap.forEach(child => {
    if (child.val().status === ORDER_STATUS.CART) {
      cartOrderId = child.key;
      cartOrder   = child.val();
    }
  });
  return cartOrderId ? { orderId: cartOrderId, order: cartOrder } : null;
}

// product = { productId, name, price, image, quantity }
async function addToCartDB(db, userId, product) {
  const existing = await getActiveCart(db, userId);
  if (existing) {
    const items = existing.order.items || [];
    const idx   = items.findIndex(i => i.productId === product.productId);
    if (idx >= 0) {
      items[idx].quantity += product.quantity || 1;
    } else {
      items.push({ ...product, quantity: product.quantity || 1 });
    }
    const total = calculateItemsTotal(items);
    await db.ref(`orders/${existing.orderId}`).update({ items, totalAmount: total });
    return existing.orderId;
  } else {
    const newRef = db.ref("orders").push();
    const items  = [{ ...product, quantity: product.quantity || 1 }];
    const total  = calculateItemsTotal(items);
    await newRef.set({
      userId, items, totalAmount: total,
      status: ORDER_STATUS.CART,
      paymentMethod: null, paymentStatus: null, razorpayPaymentId: null,
      createdAt: new Date().toISOString()
    });
    return newRef.key;
  }
}

async function updateCartItemQty(db, orderId, productId, delta) {
  const snap  = await db.ref(`orders/${orderId}`).once("value");
  const order = snap.val();
  if (!order) return;
  const items = order.items || [];
  const idx   = items.findIndex(i => i.productId === productId);
  if (idx === -1) return;
  items[idx].quantity += delta;
  if (items[idx].quantity <= 0) items.splice(idx, 1);
  const total = calculateItemsTotal(items);
  await db.ref(`orders/${orderId}`).update({ items, totalAmount: total });
}

async function removeCartItem(db, orderId, productId) {
  const snap  = await db.ref(`orders/${orderId}`).once("value");
  const order = snap.val();
  if (!order) return;
  const items = (order.items || []).filter(i => i.productId !== productId);
  const total = calculateItemsTotal(items);
  await db.ref(`orders/${orderId}`).update({ items, totalAmount: total });
}

async function placeOrderCOD(db, orderId) {
  await db.ref(`orders/${orderId}`).update({
    status: ORDER_STATUS.CONFIRMED, paymentMethod: "COD",
    paymentStatus: "Pending", confirmedAt: new Date().toISOString()
  });
}

async function placeOrderOnline(db, orderId, razorpayPaymentId) {
  await db.ref(`orders/${orderId}`).update({
    status: ORDER_STATUS.CONFIRMED, paymentMethod: "ONLINE",
    paymentStatus: "Paid", razorpayPaymentId,
    confirmedAt: new Date().toISOString()
  });
}

async function syncCartBadge(db, userId) {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  const cart  = await getActiveCart(db, userId);
  const items = cart?.order?.items || [];
  const total = items.reduce((s, i) => s + (i.quantity || 0), 0);
  badge.textContent   = total;
  badge.style.display = total > 0 ? "flex" : "none";
}
