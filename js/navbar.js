// ─────────────────────────────────────────────────────────────────
//  navbar.js  –  Fixed hide-on-scroll navbar + auth state (Phase 4)
//
//  Responsibilities:
//    1. Wrap .nav-bar in .header, apply hide-on-scroll behavior
//    2. Inject auth state into navbar:
//         - Logged out: show Login link
//         - Logged in:  show username + Logout link
//    3. Wire hamburger menu for mobile
// ─────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  function on(element, eventName, handler, options) {
    if (element) {
      element.addEventListener(eventName, handler, options);
    }
  }

  // ── 1. Find the navbar element ────────────────
  const navEl =
    document.querySelector(".nav-bar") || document.querySelector(".orders-nav");
  if (!navEl) return;

  // ── 2. Wrap in .header (only once) ───────────
  let header = navEl.closest(".header");
  if (!header) {
    header = document.createElement("div");
    header.className = "header";
    navEl.parentNode.insertBefore(header, navEl);
    header.appendChild(navEl);
  }

  // ── 2b. Inject overlay div (only once) ───────
  if (!document.querySelector(".nav-menu-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "nav-menu-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => setMenuOpen(false));
  }

  // ── 3. Body padding = navbar height ──────────
  function syncPadding() {
    // Use the actual rendered height of the header element, not a guess
    const h = header.getBoundingClientRect().height || header.offsetHeight || 72;
    document.body.style.paddingTop = h + "px";
  }
  syncPadding();
  on(window, "resize", syncPadding, { passive: true });

  // ── 4. Hide-on-scroll ─────────────────────────
  let lastScroll = window.pageYOffset;
  on(
    window,
    "scroll",
    function () {
      const tab = navEl.querySelector(".features-tab");
      if (tab && tab.classList.contains("nav-open")) return;

      const current = window.pageYOffset;
      header.classList.toggle("scrolled", current > 10);
      if (current > lastScroll && current > 50) {
        header.classList.add("hide");
      } else {
        header.classList.remove("hide");
      }
      lastScroll = current;
    },
    { passive: true },
  );

  // ── 5. Auth state injection ───────────────────
  // Reads session from localStorage (written by login.js / otp.js).
  // Injects a user pill (name + logout) or a Login link into the navbar.
  async function injectAuthState(retries = 20) {
    const page = (window.location.pathname.replace(/\/$/, "") || "/");

    const skipPages = [
      "/auth",
      "/login",
      "/otp",
      "/admin",
      "/dashboard",
      "/products-admin",
      "/category-admin",
      "/admin-orders",
      "/sso-callback",
    ];

    if (skipPages.includes(page)) return;

    // Wait until navbar DOM exists
    const frame = navEl.querySelector(".frame-5470");

    if (!frame) {
      console.warn("[Navbar] .frame-5470 not ready");

      // Retry after delay
      if (retries > 0) {
        setTimeout(() => {
          injectAuthState(retries - 1);
        }, 300);
      }

      return;
    }

    // Remove old auth UI
    const existing = frame.querySelector(".nav-auth");

    if (existing) existing.remove();

    // Read session
    let user = null;

    try {
      const raw = localStorage.getItem("user");

      if (raw) {
        const parsed = JSON.parse(raw);

        if (parsed?.id) {
          user = parsed;
        }
      }
    } catch (err) {
      console.error("[Navbar] Session parse error", err);
    }

    console.log("[Navbar] Rendering user:", user);

    const authEl = document.createElement("div");

    authEl.className = "nav-auth";

    if (user) {
      const display = escapeHtml(user.email || user.username || "Account");

      authEl.innerHTML = `
      <div class="nav-user-pill">
        <span class="nav-username">
          👤 ${display}
        </span>

        <button
          class="nav-logout-btn"
          id="user-logout-btn"
          aria-label="Logout"
        >
          Logout
        </button>
      </div>
    `;
    } else {
      authEl.innerHTML = `
      <a
        class="nav-login-link"
        href="/login"
      >
        Login
      </a>
    `;
    }

    // Insert before cart
    const cartBtn = frame.querySelector(".cart-button");

    if (cartBtn) {
      frame.insertBefore(authEl, cartBtn);
    } else {
      frame.appendChild(authEl);
    }

    console.log("[Navbar] Auth injected successfully");
  }

  // ── 6. Hamburger menu ─────────────────────────
  function setMenuOpen(open) {
    const btn = document.getElementById("nav-hamburger");
    const tab = navEl.querySelector(".features-tab");
    if (!btn || !tab) return;

    btn.classList.toggle("open", open);
    tab.classList.toggle("nav-open", open);
    document.body.classList.toggle("nav-menu-open", open);
    header.classList.remove("hide");

    if (open) {
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close menu");
    } else {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Open menu");
    }
  }

  function wireHamburger() {
    const btn = document.getElementById("nav-hamburger");
    const tab = navEl.querySelector(".features-tab");
    if (!btn || !tab) return;

    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";

    on(btn, "click", function (e) {
      console.log("Hamburger clicked");

      e.stopPropagation();
      e.preventDefault();

      setMenuOpen(!tab.classList.contains("nav-open"));
    });

    // Wire each nav link to close menu AND navigate
    // Wire each nav link
    console.log(
      "MENU ITEMS FOUND:",
      tab.querySelectorAll("[onclick]").length
    );

    tab.querySelectorAll("[onclick]").forEach(function (link) {
      const onclickVal = link.getAttribute("onclick");

      link.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        console.log("MENU CLICK:", onclickVal);

        setMenuOpen(false);

        if (onclickVal.includes("/about")) {
          window.location.href = "/about";
          return;
        }

        if (onclickVal.includes("/productlist")) {
          window.location.href = "/productlist";
          return;
        }

        if (onclickVal.includes("/deal")) {
          window.location.href = "/deal";
          return;
        }

        if (onclickVal.includes("/")) {
          window.location.href = "/";
          return;
        }

        if (onclickVal.includes("goToOrders")) {
          goToOrders();
          return;
        }
      });
    });

    // Close menu when clicking outside
    // on(document, "click", function (e) {
    //   if (e.target.closest("#nav-hamburger")) return;
    //   if (e.target.closest(".features-tab")) return;
    //   if (e.target.closest(".nav-auth")) return;
    //   setMenuOpen(false);
    // });

    on(document, "keydown", function (e) {
      if (e.key === "Escape") setMenuOpen(false);
    });
  }

  // ── Helper: escape HTML to prevent XSS ───────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Run after DOM is ready
  // ─────────────────────────────────────────────
  // Initialize navbar AFTER Clerk/session restore
  // ─────────────────────────────────────────────

  // DOM ready

  // Re-render navbar when session changes
  // ─────────────────────────────────────────────
  // FINAL NAVBAR INITIALIZATION
  // ─────────────────────────────────────────────

  async function renderNavbar() {
    // Wait a little for Clerk/session restore
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await injectAuthState();

    wireHamburger();
    syncPadding();

    console.log("[Navbar] Rendered");
  }

  // Wire hamburger immediately (don't wait for auth)
  wireHamburger();

  // Initial render
  on(window, "DOMContentLoaded", () => {
    wireHamburger();
    renderNavbar();
  });

  // Re-render after auth changes
  on(window, "auth-changed", () => {
    console.log("[Navbar] auth-changed");

    renderNavbar();
  });

  // Logout click handler — delegates to userLogout() from session.js
  on(document, "click", async (e) => {
    const logoutBtn = e.target.closest("#user-logout-btn");
    if (!logoutBtn) return;
    e.preventDefault();

    // Use the shared userLogout() if available, otherwise inline fallback
    if (typeof window.userLogout === "function") {
      await window.userLogout();
    } else {
      // Fallback (session.js not loaded on this page)
      sessionStorage.setItem("__loggingOut", "1");
      localStorage.clear();
      try {
        const clerk = await window.clerkReady;
        await clerk.signOut();
      } catch { /* ignore */ }
      sessionStorage.clear();
      window.location.replace("/login");
    }
  });

  // Custom auth event
})();
