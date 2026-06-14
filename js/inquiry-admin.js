const firebaseConfig = {
  apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain: "khakhra-5cb3d.firebaseapp.com",
  databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId: "khakhra-5cb3d",
  storageBucket: "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId: "1:713999821089:web:f0c25da51cff322d61b660",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();

let allInquiries = [];
let inquiryMessages = {};
let activeFilter = "all";
let searchQuery = "";

// DOM
const rowsEl = document.getElementById("order-rows");
const searchInput = document.getElementById("search-input");

// Stats
const statTotal = document.getElementById("stat-total");
const statConfirmed = document.getElementById("stat-confirmed");
const statShipped = document.getElementById("stat-shipped");
const statDelivered = document.getElementById("stat-delivered");
const statSuspicious = document.getElementById("stat-suspicious");

// ----------------------------
// Helpers
// ----------------------------

function formatDate(date) {
  if (!date) return "-";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateStats() {
  const pending = allInquiries.filter(
    (x) => (x.status || "pending") === "pending",
  ).length;

  const completed = allInquiries.filter((x) => x.status === "completed").length;

  statTotal.textContent = allInquiries.length;
  statConfirmed.textContent = pending;
  statShipped.textContent = completed;

  // Hide unused cards values
  statDelivered.textContent = "-";
  statSuspicious.textContent = "-";

  document.querySelector(".stat-label:nth-of-type(1)");
}

function getFilteredData() {
  let data = [...allInquiries];

  if (activeFilter === "pending") {
    data = data.filter((x) => (x.status || "pending") === "pending");
  }

  if (activeFilter === "completed") {
    data = data.filter((x) => x.status === "completed");
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();

    data = data.filter(
      (item) =>
        (item.name || "").toLowerCase().includes(q) ||
        (item.email || "").toLowerCase().includes(q) ||
        (item.phone || "").toLowerCase().includes(q) ||
        (item.type || "").toLowerCase().includes(q),
    );
  }

  return data;
}

function renderRows() {
  const list = getFilteredData();

  if (!list.length) {
    rowsEl.innerHTML = `
      <div class="table-loading">
        No inquiries found
      </div>
    `;
    return;
  }

  rowsEl.innerHTML = list
    .map((item) => {
      const status = item.status || "pending";

      return `
      <div class="order-row">

        <div class="cell-id">
          ${item.id.substring(0, 10)}...
        </div>

        <div>
          <strong>${item.name || "-"}</strong>
          <br>
          ${item.phone || "-"}
        </div>

        <div>
          ${item.email || "-"}
        </div>

        <div>
            <button
                class="view-message-btn"
                onclick="openMessageModal('${item.id}')">
                View
            </button>
        </div>

        <div>
          ${item.source || "-"}
        </div>

        <div>
          ${
            status === "completed"
              ? `<span class="status-badge status-4">🟢 Completed</span>`
              : `<span class="status-badge status-2">🟠 Pending</span>`
          }
        </div>

        <div>
          ${
            status === "pending"
              ? `
              <button
              class="inquiry-complete-btn"
                onclick="markComplete('${item.id}')">
                Complete
              </button>
            `
              : "✅ Done"
          }
        </div>

      </div>
    `;
    })
    .join("");
}

// ----------------------------
// Complete Inquiry
// ----------------------------

window.markComplete = async function (id) {
  try {
    await db.ref("contacts/" + id).update({
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    alert("Failed to update inquiry");
  }
};

// ----------------------------
// Search
// ----------------------------

searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderRows();
});

// ----------------------------
// Filters
// ----------------------------

document.getElementById("filter-group")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");

  if (!btn) return;

  document
    .querySelectorAll(".filter-btn")
    .forEach((x) => x.classList.remove("active"));

  btn.classList.add("active");

  const map = {
    all: "all",
    2: "pending",
    3: "completed",
  };

  activeFilter = map[btn.dataset.filter];

  renderRows();
});

// ----------------------------
// Firebase Listener
// ----------------------------

db.ref("contacts").on("value", (snap) => {
  allInquiries = [];

  if (snap.exists()) {
    snap.forEach((child) => {
      const data = child.val();

      inquiryMessages[child.key] = data.message || "No message available";

      allInquiries.push({
        id: child.key,
        ...data,
      });
    });
  }

  allInquiries.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );

  updateStats();
  renderRows();
});
window.openMessageModal = function (id) {
  const message = inquiryMessages[id] || "No message available";

  document.getElementById("messageContent").innerText = message;

  document.getElementById("messageModal").style.display = "flex";
};

window.closeMessageModal = function () {
  document.getElementById("messageModal").style.display = "none";
};
