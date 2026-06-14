// toast.js — Global toast notification
// Usage: showToast("Message", "success" | "error" | "info")

(function () {
  let el = null, timer = null;

  window.showToast = function (msg, type = "success", ms = 3000) {
    if (!el) {
      el = document.createElement("div");
      el.className = "ds-toast";
      document.body.appendChild(el);
    }
    const icons = { success: "✅", error: "❌", info: "ℹ️" };
    el.innerHTML = `<span>${icons[type] || ""}</span><span>${msg}</span>`;
    el.className = `ds-toast ${type} show`;
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("show"), ms);
  };
})();
