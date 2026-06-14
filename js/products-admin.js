document.addEventListener("DOMContentLoaded", function () {
  const UPLOAD_API_URL = window.APP_CONFIG?.API_BASE_URL + "/upload";

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const rowsContainer = document.getElementById("product-rows");
  const searchInput = document.getElementById("search-input");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const productForm = document.getElementById("product-form");
  const editIdInput = document.getElementById("edit-id");
  const fName = document.getElementById("f-name");
  const fIndiaPrice = document.getElementById("f-india-price");
  const fInternationalPrice = document.getElementById("f-international-price");
  const fAvailability = document.getElementById("f-availability");
  const fCategory = document.getElementById("f-category");
  const fDesc = document.getElementById("f-desc");
  const btnSave = document.getElementById("btn-save");

  // Three image slots
  const imgSlots = [1, 2, 3].map(function (n) {
    return {
      input:     document.getElementById("f-image" + n),
      preview:   document.getElementById("image-preview" + n),
      labelText: document.getElementById("image-label-text" + n),
    };
  });

  // Existing URLs when editing (one per slot)
  let currentImageUrls = ["", "", ""];

  function on(element, eventName, handler) {
    if (element) element.addEventListener(eventName, handler);
  }

  function setText(element, value) {
    if (element) element.textContent = String(value);
  }

  function hasDatabase() {
    return typeof db !== "undefined" && db && typeof db.ref === "function";
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  on(document.getElementById("logout-btn"), "click", function () {
    window.location.href = "/admin";
  });

  // ── Modal helpers ────────────────────────────────────────────────────────────
  function openModal(title) {
    if (modalTitle) modalTitle.textContent = title;
    if (modalOverlay) modalOverlay.classList.add("open");
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove("open");
    if (productForm) productForm.reset();
    if (editIdInput) editIdInput.value = "";
    currentImageUrls = ["", "", ""];
    imgSlots.forEach(function (slot) {
      if (slot.preview) { slot.preview.src = ""; slot.preview.style.display = "none"; }
      if (slot.labelText) slot.labelText.textContent = "Choose image file";
    });
  }

  on(document.getElementById("modal-close"), "click", closeModal);
  on(document.getElementById("btn-cancel"), "click", closeModal);
  on(modalOverlay, "click", function (e) {
    if (e.target === modalOverlay) closeModal();
  });

  // ── Image previews ───────────────────────────────────────────────────────────
  imgSlots.forEach(function (slot) {
    on(slot.input, "change", function () {
      var file = slot.input.files && slot.input.files[0];
      if (!file) return;
      if (slot.labelText) slot.labelText.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function (e) {
        if (slot.preview) { slot.preview.src = e.target.result; slot.preview.style.display = "block"; }
      };
      reader.readAsDataURL(file);
    });
  });

  // ── Price / availability helpers ─────────────────────────────────────────────
  function resolveAvailability(product) {
    if (typeof product.isAvailable === "boolean") return product.isAvailable;
    if (typeof product.stockStatus === "boolean") return product.stockStatus;
    var legacyStock = parseInt(product.stock, 10);
    if (!Number.isNaN(legacyStock)) return legacyStock > 0;
    return true;
  }

  function parsePositivePrice(value) {
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
  }

  function resolveIndiaPrice(product) {
    var direct = product && (product.indiaPrice != null ? product.indiaPrice : product.price);
    var parsed = parsePositivePrice(direct);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function resolveInternationalPrice(product) {
    var direct = product && (product.internationalPrice != null ? product.internationalPrice : resolveIndiaPrice(product));
    var parsed = parsePositivePrice(direct);
    return Number.isFinite(parsed) ? parsed : resolveIndiaPrice(product);
  }

  function availabilityClass(v) { return v ? "in" : "out"; }
  function availabilityLabel(v) { return v ? "🟢 In Stock" : "🔴 Out of Stock"; }

  function migrateLegacyAvailability(productId, product) {
    if (!hasDatabase()) return;
    if (typeof product.isAvailable === "boolean") return;
    if (typeof product.stock === "undefined") return;
    db.ref("products/" + productId).update({ isAvailable: resolveAvailability(product), stock: null })
      .catch(function (err) { console.error("❌ Legacy availability migration failed:", err); });
  }

  function migrateLegacyPricing(productId, product) {
    if (!hasDatabase()) return;
    var legacyIndiaPrice = resolveIndiaPrice(product);
    var updates = {};
    if (typeof product.indiaPrice === "undefined" && legacyIndiaPrice > 0) updates.indiaPrice = legacyIndiaPrice;
    if (typeof product.internationalPrice === "undefined" && legacyIndiaPrice > 0) updates.internationalPrice = legacyIndiaPrice;
    if (Object.keys(updates).length === 0) return;
    db.ref("products/" + productId).update(updates)
      .catch(function (err) { console.error("❌ Legacy pricing migration failed:", err); });
  }

  // ── Render rows ──────────────────────────────────────────────────────────────
  var allProducts = [];
  var categoryMap = {};

  function renderRows(products) {
    if (!rowsContainer) return;
    rowsContainer.innerHTML = "";
    if (!products.length) {
      rowsContainer.innerHTML = '<div class="table-loading">No products found.</div>';
      return;
    }
    products.forEach(function (p, i) {
      var row = document.createElement("div");
      row.className = "pm-row";
      row.dataset.id = p.id;

      // Use image1 first, fall back to legacy image field for old products
      var imgSrc = p.image1 || p.image || "";
      var imgEl = imgSrc
        ? '<img class="pm-row-img" src="' + imgSrc + '" alt="' + (p.name || "") + '" />'
        : '<div class="pm-row-img-placeholder">No img</div>';

      var isAvailable = resolveAvailability(p);
      var indiaPrice = resolveIndiaPrice(p);
      var internationalPrice = resolveInternationalPrice(p);

      row.innerHTML =
        '<span class="pm-row-num">' + (i + 1) + "</span>" +
        imgEl +
        '<span class="pm-row-name">' + (p.name || "—") + "</span>" +
        '<span class="pm-row-cat">' + (categoryMap[p.categoryId] || p.categoryId || "—") + "</span>" +
        '<span class="pm-row-price">Rs. ' + indiaPrice.toFixed(2) + "</span>" +
        '<span class="pm-row-price">Rs. ' + internationalPrice.toFixed(2) + "</span>" +
        '<span class="pm-row-stock ' + availabilityClass(isAvailable) + '">' + availabilityLabel(isAvailable) + "</span>" +
        '<div class="pm-row-actions">' +
        '<button type="button" class="delete-btn" data-id="' + p.id + '" title="Delete">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4136" stroke-width="2">' +
        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
        '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' +
        "</svg></button>" +
        '<button type="button" class="edit-btn" data-id="' + p.id + '" title="Edit">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">' +
        '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
        '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
        "</svg></button>" +
        "</div>";

      rowsContainer.appendChild(row);
    });
  }

  // ── Load categories dropdown ─────────────────────────────────────────────────
  function loadCategories(selectedId) {
    if (!fCategory || !hasDatabase()) return Promise.resolve();
    selectedId = selectedId || "";
    return db.ref("categories").once("value")
      .then(function (snap) {
        fCategory.innerHTML = '<option value="" disabled>Select a category</option>';
        if (snap.exists()) {
          snap.forEach(function (child) {
            var opt = document.createElement("option");
            opt.value = child.key;
            opt.textContent = child.val().name || child.key;
            if (child.key === selectedId) opt.selected = true;
            fCategory.appendChild(opt);
          });
        }
        if (!selectedId) fCategory.selectedIndex = 0;
      })
      .catch(function (err) {
        console.error("❌ Category load error:", err);
        fCategory.innerHTML = '<option value="">Failed to load</option>';
      });
  }

  loadCategories();

  // ── Load products + summary ──────────────────────────────────────────────────
  function loadAll() {
    if (!rowsContainer || !hasDatabase()) return;
    rowsContainer.innerHTML = '<div class="table-loading">Loading products...</div>';

    Promise.all([
      db.ref("products").once("value"),
      db.ref("categories").once("value"),
    ]).then(function (results) {
      var prodSnap = results[0];
      var catSnap  = results[1];

      setText(document.getElementById("total-category"), catSnap.exists() ? catSnap.numChildren() : 0);
      setText(document.getElementById("total-products"), prodSnap.exists() ? prodSnap.numChildren() : 0);

      categoryMap = {};
      if (catSnap.exists()) {
        catSnap.forEach(function (child) { categoryMap[child.key] = child.val().name || child.key; });
      }

      allProducts = [];
      var availableCount = 0;
      if (prodSnap.exists()) {
        prodSnap.forEach(function (child) {
          var p = Object.assign({ id: child.key }, child.val());
          allProducts.push(p);
          if (resolveAvailability(p)) availableCount++;
          migrateLegacyAvailability(child.key, p);
          migrateLegacyPricing(child.key, p);
        });
      }

      setText(document.getElementById("total-stock"), availableCount);
      renderRows(allProducts);
    }).catch(function (err) {
      console.error("❌ Load error:", err);
      if (rowsContainer) rowsContainer.innerHTML = '<div class="table-loading">Failed to load products.</div>';
    });
  }

  loadAll();

  // ── Search ───────────────────────────────────────────────────────────────────
  on(searchInput, "input", function () {
    var q = this.value.toLowerCase();
    renderRows(allProducts.filter(function (p) {
      return (p.name || "").toLowerCase().includes(q) ||
        (categoryMap[p.categoryId] || p.categoryId || "").toLowerCase().includes(q);
    }));
  });

  // ── Open Add modal ───────────────────────────────────────────────────────────
  on(document.getElementById("add-btn"), "click", function () {
    if (editIdInput) editIdInput.value = "";
    loadCategories();
    openModal("Add Product");
  });

  // ── Upload single file helper ────────────────────────────────────────────────
  function uploadFile(file) {
    var formData = new FormData();
    formData.append("image", file);
    return fetch(UPLOAD_API_URL, { method: "POST", body: formData })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (payload) {
          if (!res.ok || payload.success === false) throw new Error(payload.error || "Upload failed");
          if (!payload.imageUrl || !payload.imageUrl.startsWith("https://res.cloudinary.com/")) {
            throw new Error("Invalid upload URL received from server.");
          }
          return payload.imageUrl;
        });
      });
  }

  // ── Form submit ──────────────────────────────────────────────────────────────
  on(productForm, "submit", function (e) {
    e.preventDefault();

    if (!hasDatabase()) { alert("Database unavailable."); return; }

    var id = editIdInput ? editIdInput.value.trim() : "";
    var categoryId = fCategory ? fCategory.value : "";
    var files = imgSlots.map(function (slot) {
      return slot.input && slot.input.files ? (slot.input.files[0] || null) : null;
    });
    var indiaPrice = fIndiaPrice ? parsePositivePrice(fIndiaPrice.value) : NaN;
    var internationalPrice = fInternationalPrice ? parsePositivePrice(fInternationalPrice.value) : NaN;

    if (!categoryId) { alert("Please select a category."); return; }
    if (!Number.isFinite(indiaPrice) || indiaPrice <= 0) { alert("Please enter a valid India Price."); return; }
    if (!Number.isFinite(internationalPrice) || internationalPrice <= 0) { alert("Please enter a valid International Price."); return; }
    // For new products Image 1 is required; for edits it's optional (keeps existing)
    if (!id && !files[0]) { alert("Please select at least Image 1 for the product."); return; }

    if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Uploading..."; }

    function saveToDatabase(imageUrls) {
      var data = {
        name: fName ? fName.value.trim() : "",
        indiaPrice: indiaPrice,
        internationalPrice: internationalPrice,
        isAvailable: fAvailability ? !!fAvailability.checked : true,
        categoryId: categoryId,
        // Keep legacy `image` field = image1 so existing pages keep working
        image:  imageUrls[0] || "",
        image1: imageUrls[0] || "",
        image2: imageUrls[1] || "",
        image3: imageUrls[2] || "",
        description: fDesc ? fDesc.value.trim() : "",
        updatedAt: new Date().toISOString(),
      };

      var ref = id
        ? db.ref("products/" + id).update(data)
        : db.ref("products").push(Object.assign({ createdAt: new Date().toISOString() }, data));

      ref.then(function () {
        alert(id ? "✅ Product updated!" : "✅ Product added!");
        closeModal();
        loadAll();
      }).catch(function (err) {
        console.error("❌ DB error:", err);
        alert("Failed to save: " + err.message);
      }).finally(function () {
        if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Save Product"; }
      });
    }

    // Upload new files; keep existing URL for slots where no new file was chosen
    var uploadPromises = files.map(function (file, idx) {
      if (file) return uploadFile(file);
      return Promise.resolve(currentImageUrls[idx] || "");
    });

    Promise.all(uploadPromises)
      .then(function (urls) { saveToDatabase(urls); })
      .catch(function (err) {
        console.error("Upload error:", err);
        alert("Upload failed: " + (err.message || "Network/Server error"));
        if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Save Product"; }
      });
  });

  // ── Delete & Edit ────────────────────────────────────────────────────────────
  on(document, "click", async function (e) {
    var target = e.target instanceof Element ? e.target : null;
    if (!target || !hasDatabase()) return;

    var delBtn = target.closest(".delete-btn");
    if (delBtn) {
      if (!confirm("Delete this product?")) return;
      try {
        await db.ref("products/" + delBtn.dataset.id).remove();
        alert("Product deleted successfully");
        loadAll();
      } catch (err) { console.error(err); alert("Delete failed"); }
      return;
    }

    var editBtn = target.closest(".edit-btn");
    if (editBtn) {
      var productId = editBtn.dataset.id;
      try {
        var snap = await db.ref("products/" + productId).once("value");
        if (!snap.exists()) { alert("Product not found"); return; }
        var p = snap.val();

        if (editIdInput) editIdInput.value = productId;
        if (fName) fName.value = p.name || "";
        if (fIndiaPrice) fIndiaPrice.value = resolveIndiaPrice(p) || "";
        if (fInternationalPrice) fInternationalPrice.value = resolveInternationalPrice(p) || "";
        if (fAvailability) fAvailability.checked = resolveAvailability(p);
        if (fDesc) fDesc.value = p.description || "";

        // Populate existing image URLs (support legacy single-image products)
        currentImageUrls = [
          p.image1 || p.image || "",
          p.image2 || "",
          p.image3 || "",
        ];

        imgSlots.forEach(function (slot, idx) {
          var url = currentImageUrls[idx];
          if (slot.preview) { slot.preview.src = url || ""; slot.preview.style.display = url ? "block" : "none"; }
          if (slot.labelText) slot.labelText.textContent = url ? "Change image (optional)" : "Choose image file";
        });

        await loadCategories(p.categoryId || "");
        openModal("Edit Product");
      } catch (err) { console.error(err); alert("Edit failed"); }
    }
  });
});
