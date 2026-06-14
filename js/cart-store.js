// cart-store.js - shared localStorage cart helpers

const CART_STORAGE_KEY = "cart";

function normalizeCartItem(item) {
  if (!item) return null;

  const id = String(item.id || item.productId || "").trim();
  if (!id) return null;

  const quantity = Math.max(
    1,
    parseInt(item.quantity ?? item.qty ?? 1, 10) || 1
  );

  return {
    id,
    name: item.name || item.title || "",
    price: resolveIndiaPrice(item),
    indiaPrice: resolveIndiaPrice(item),
    internationalPrice: resolveInternationalPrice(item),
    image: item.image || "",
    quantity,
  };
}

function resolveIndiaPrice(product) {
  if (!product) return 0;

  const direct = product.indiaPrice ?? product.price;
  const parsed = parseFloat(direct);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveInternationalPrice(product) {
  if (!product) return 0;

  const direct = product.internationalPrice ?? resolveIndiaPrice(product);
  const parsed = parseFloat(direct);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : resolveIndiaPrice(product);
}

function normalizeCart(cart) {
  const merged = new Map();

  (Array.isArray(cart) ? cart : []).forEach((item) => {
    const normalized = normalizeCartItem(item);
    if (!normalized) return;

    const existing = merged.get(normalized.id);
    if (existing) {
      existing.quantity += normalized.quantity;
      if (!existing.name && normalized.name) existing.name = normalized.name;
      if (!existing.image && normalized.image) existing.image = normalized.image;
      if (!existing.price && normalized.price) existing.price = normalized.price;
      if (!existing.indiaPrice && normalized.indiaPrice) existing.indiaPrice = normalized.indiaPrice;
      if (!existing.internationalPrice && normalized.internationalPrice) existing.internationalPrice = normalized.internationalPrice;
      return;
    }

    merged.set(normalized.id, normalized);
  });

  return Array.from(merged.values());
}

function readRawCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function getCart() {
  const cart = normalizeCart(readRawCart());
  const current = JSON.stringify(readRawCart());
  const normalized = JSON.stringify(cart);

  if (current !== normalized) {
    localStorage.setItem(CART_STORAGE_KEY, normalized);
  }

  return cart;
}

function dispatchCartUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cart-updated"));
}

function saveCart(cart) {
  const normalized = normalizeCart(cart);
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
  dispatchCartUpdated();
  return normalized;
}

function getCartItem(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  return getCart().find((item) => item.id === id) || null;
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function isProductAvailable(product) {
  if (!product) return true;
  if (typeof product.isAvailable === "boolean") return product.isAvailable;
  if (typeof product.stockStatus === "boolean") return product.stockStatus;
  if (typeof product.available === "boolean") return product.available;

  const legacyStock = parseInt(product.stock, 10);
  if (!Number.isNaN(legacyStock)) return legacyStock > 0;

  return true;
}

function addToCart(product) {
  const normalized = normalizeCartItem(product);
  if (!normalized) return 0;

  const cart = getCart();
  const existing = cart.find((item) => item.id === normalized.id);
  if (existing) {
    existing.quantity += normalized.quantity;
  } else {
    cart.push(normalized);
  }

  saveCart(cart);
  return getCartItem(normalized.id)?.quantity || 0;
}

function updateQuantity(productId, quantity) {
  const id = String(productId || "").trim();
  if (!id) return 0;

  const cart = getCart();
  const index = cart.findIndex((item) => item.id === id);
  if (index === -1) return 0;

  const nextQuantity = parseInt(quantity, 10) || 0;
  if (nextQuantity <= 0) {
    cart.splice(index, 1);
    saveCart(cart);
    return 0;
  }

  cart[index].quantity = nextQuantity;
  saveCart(cart);
  return nextQuantity;
}

function increaseQuantity(productId) {
  const item = getCartItem(productId);
  if (!item) return 0;
  return updateQuantity(productId, item.quantity + 1);
}

function decreaseQuantity(productId) {
  const item = getCartItem(productId);
  if (!item) return 0;
  return updateQuantity(productId, item.quantity - 1);
}

function removeFromCart(productId) {
  const id = String(productId || "").trim();
  if (!id) return;

  const cart = getCart().filter((item) => item.id !== id);
  saveCart(cart);
}

function syncCartUI() {
  dispatchCartUpdated();
}

window.getCart = getCart;
window.saveCart = saveCart;
window.getCartItem = getCartItem;
window.getCartCount = getCartCount;
window.isProductAvailable = isProductAvailable;
window.resolveIndiaPrice = resolveIndiaPrice;
window.resolveInternationalPrice = resolveInternationalPrice;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.removeFromCart = removeFromCart;
window.syncCartUI = syncCartUI;
