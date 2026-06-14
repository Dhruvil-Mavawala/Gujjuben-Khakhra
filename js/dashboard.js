// dashboard.js — Admin Dashboard with Analytics + Charts

document.addEventListener("DOMContentLoaded", function () {

  // ── Logout ──────────────────────────────────────────────────────────────────
  document.getElementById("logout-btn").addEventListener("click", function () {
    window.location.href = "/admin";
  });

  // ── Draft new product shortcut ───────────────────────────────────────────────
  document.querySelector(".draft-card")?.addEventListener("click", () => {
    window.location.href = "/products-admin";
  });

  // ── Fetch all data in parallel ───────────────────────────────────────────────
  Promise.all([
    db.ref("products").once("value"),
    db.ref("categories").once("value"),
    db.ref("orders").orderByChild("status").startAt(2).once("value")
  ])
  .then(([productsSnap, categoriesSnap, ordersSnap]) => {

    // ── Product count ──────────────────────────────────────────────────────────
    const productCount = productsSnap.exists() ? productsSnap.numChildren() : 0;
    document.getElementById("product-count").textContent = productCount;

    // ── Category count + lookup map ────────────────────────────────────────────
    const categoryCount = categoriesSnap.exists() ? categoriesSnap.numChildren() : 0;
    document.getElementById("category-count").textContent = categoryCount;

    const categoryMap = {};
    if (categoriesSnap.exists()) {
      categoriesSnap.forEach(child => {
        categoryMap[child.key] = child.val().name || child.key;
      });
    }

    // ── Collect orders ─────────────────────────────────────────────────────────
    const orders = [];
    if (ordersSnap.exists()) {
      ordersSnap.forEach(child => {
        const o = child.val();
        if (o.status >= 2) orders.push({ orderId: child.key, ...o });
      });
    }

    // ── Analytics cards ────────────────────────────────────────────────────────
    const totalOrders    = orders.length;
    const delivered      = orders.filter(o => o.status === 4);
    const pending        = orders.filter(o => o.status === 2).length;
    const totalRevenue   = delivered.reduce((s, o) => s + parseFloat(o.totalAmount || 0), 0);

    document.getElementById("analytics-orders").textContent    = totalOrders;
    document.getElementById("analytics-revenue").textContent   = "₹" + totalRevenue.toFixed(0);
    document.getElementById("analytics-pending").textContent   = pending;
    document.getElementById("analytics-delivered").textContent = delivered.length;
    document.getElementById("analytics-orders-sub").textContent =
      totalOrders === 1 ? "1 order total" : `${totalOrders} orders total`;

    // ── Revenue chart — last 7 days ────────────────────────────────────────────
    const today = new Date();
    const dayLabels = [];
    const dayRevenue = new Array(7).fill(0);
    const dayOrders  = new Array(7).fill(0);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dayLabels.push(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }));
    }

    orders.forEach(o => {
      const dateStr = o.confirmedAt || o.createdAt;
      if (!dateStr) return;
      const orderDate = new Date(dateStr);
      const diffDays  = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        const idx = 6 - diffDays;
        dayRevenue[idx] += parseFloat(o.totalAmount || 0);
        dayOrders[idx]  += 1;
      }
    });

    // Revenue line chart
    const revenueCtx = document.getElementById("revenueChart")?.getContext("2d");
    if (revenueCtx) {
      new Chart(revenueCtx, {
        type: "line",
        data: {
          labels: dayLabels,
          datasets: [
            {
              label: "Revenue (₹)",
              data: dayRevenue,
              borderColor: "#009848",
              backgroundColor: "rgba(0,152,72,0.08)",
              borderWidth: 2.5,
              pointBackgroundColor: "#009848",
              pointRadius: 4,
              pointHoverRadius: 6,
              fill: true,
              tension: 0.4,
              yAxisID: "y"
            },
            {
              label: "Orders",
              data: dayOrders,
              borderColor: "#ef4136",
              backgroundColor: "rgba(239,65,54,0.06)",
              borderWidth: 2,
              pointBackgroundColor: "#ef4136",
              pointRadius: 3,
              pointHoverRadius: 5,
              fill: false,
              tension: 0.4,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "top",
              labels: { font: { size: 12 }, boxWidth: 12, padding: 16 }
            },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.yAxisID === "y"
                  ? ` ₹${ctx.parsed.y.toFixed(0)}`
                  : ` ${ctx.parsed.y} orders`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, color: "#888" }
            },
            y: {
              position: "left",
              grid: { color: "#f0f0f0" },
              ticks: {
                font: { size: 11 }, color: "#888",
                callback: v => "₹" + v.toFixed(0)
              }
            },
            y1: {
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                font: { size: 11 }, color: "#ef4136",
                stepSize: 1,
                callback: v => Number.isInteger(v) ? v : ""
              }
            }
          }
        }
      });
    }

    // Orders by status doughnut chart
    const statusCtx = document.getElementById("statusChart")?.getContext("2d");
    if (statusCtx) {
      const confirmed = orders.filter(o => o.status === 2).length;
      const shipped   = orders.filter(o => o.status === 3).length;
      const deliveredCount = orders.filter(o => o.status === 4).length;

      new Chart(statusCtx, {
        type: "doughnut",
        data: {
          labels: ["Confirmed", "Shipped", "Delivered"],
          datasets: [{
            data: [confirmed, shipped, deliveredCount],
            backgroundColor: ["#fff3e0", "#e3f2fd", "#e8f5e9"],
            borderColor:     ["#e65100", "#1565c0", "#2e7d32"],
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          cutout: "68%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 12 }, boxWidth: 12, padding: 14 }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.parsed}`
              }
            }
          }
        }
      });
    }

    // ── Render latest products table ───────────────────────────────────────────
    const rowsContainer = document.getElementById("product-rows");
    rowsContainer.innerHTML = "";

    if (!productsSnap.exists()) {
      rowsContainer.innerHTML = '<div class="table-loading">No products found.</div>';
      return;
    }

    productsSnap.forEach(child => {
      const p            = child.val();
      const name         = p.name  || p.title || "—";
      const indiaPrice   = parseFloat(p.indiaPrice ?? p.price ?? 0) || 0;
      const intlPrice    = parseFloat(p.internationalPrice ?? p.indiaPrice ?? p.price ?? 0) || indiaPrice;
      const price        = `India: \u20b9${indiaPrice.toFixed(2)} | Intl: \u20b9${intlPrice.toFixed(2)}`;
      const categoryName = categoryMap[p.categoryId] || p.categoryId || "—";
      const image        = p.image || "";
      const isAvailable  = typeof p.isAvailable === "boolean"
        ? p.isAvailable
        : (parseInt(p.stock, 10) || 0) > 0;
      const stockLabel   = isAvailable ? "🟢 In Stock" : "🔴 Out of Stock";
      const stockClass   = isAvailable ? "in-stock" : "out-stock";

      const row = document.createElement("div");
      row.className = "product-row";
      row.innerHTML = `
        <div class="row-product">
          ${image ? `<img src="${image}" alt="${name}" />` : ""}
          <span class="row-product-name">${name}</span>
        </div>
        <span class="row-price">${price}</span>
        <span class="row-category">${categoryName}</span>
        <span class="row-stock ${stockClass}">${stockLabel}</span>`;

      rowsContainer.appendChild(row);
    });

  })
  .catch(err => {
    console.error("❌ Dashboard fetch error:", err);
    document.getElementById("product-rows").innerHTML =
      '<div class="table-loading">Failed to load data.</div>';
  });

});
