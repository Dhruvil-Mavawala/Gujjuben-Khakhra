// cart-badge.js - navbar cart count badge based on localStorage cart

document.addEventListener("DOMContentLoaded", () => {
  const badge = document.getElementById("cart-count");
  if (!badge) return;

  function updateBadge() {
    const total = typeof getCartCount === "function"
      ? getCartCount()
      : (JSON.parse(localStorage.getItem("cart") || "[]") || []).reduce(
          (sum, item) => sum + Number(item.quantity ?? item.qty ?? 0),
          0
        );

    badge.textContent = total;
    badge.style.display = total > 0 ? "flex" : "none";
  }

  updateBadge();
  window.addEventListener("cart-updated", updateBadge);
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === "cart") updateBadge();
  });
});
