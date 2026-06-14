// ═══════════════════════════════════════════════════════════════════
//  Category Admin — guarded CRUD + Cloudinary upload + Firebase
// ═══════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function () {
  const UPLOAD_API_URL = window.APP_CONFIG?.API_BASE_URL + "/upload";

  const rowsContainer = document.getElementById("category-rows");
  const searchInput = document.getElementById("search-input");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const categoryForm = document.getElementById("category-form");
  const editIdInput = document.getElementById("edit-id");
  const fName = document.getElementById("f-name");
  const fDesc = document.getElementById("f-desc");
  const fImage = document.getElementById("f-image");
  const imagePreview = document.getElementById("image-preview");
  const imageLabelText = document.getElementById("image-label-text");
  const btnSave = document.getElementById("btn-save");

  let currentImageUrl = "";
  let allCategories = [];

  function on(element, eventName, handler) {
    if (element) {
      element.addEventListener(eventName, handler);
    }
  }

  function setText(element, value) {
    if (element) {
      element.textContent = String(value);
    }
  }

  function hasDatabase() {
    return typeof db !== "undefined" && db && typeof db.ref === "function";
  }

  function setLoading(isLoading, label) {
    if (btnSave) {
      btnSave.disabled = !!isLoading;
      btnSave.textContent = label || (isLoading ? "Saving..." : "Save Category");
    }
  }

  function openModal(title) {
    setText(modalTitle, title);
    if (modalOverlay) {
      modalOverlay.classList.add("open");
    }
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove("open");
    }
    if (categoryForm) {
      categoryForm.reset();
    }
    if (editIdInput) {
      editIdInput.value = "";
    }
    currentImageUrl = "";
    if (imagePreview) {
      imagePreview.src = "";
      imagePreview.style.display = "none";
    }
    setText(imageLabelText, "Choose image file");
    setLoading(false, "Save Category");
  }

  function renderRows(categories) {
    if (!rowsContainer) return;

    rowsContainer.innerHTML = "";

    if (!categories.length) {
      rowsContainer.innerHTML =
        '<div class="table-loading">No categories found.</div>';
      return;
    }

    categories.forEach(function (cat, index) {
      const row = document.createElement("div");
      row.className = "cat-row";
      row.dataset.id = cat.id;

      const imageMarkup = cat.image
        ? '<img class="cat-row-img" src="' +
          cat.image +
          '" alt="' +
          (cat.name || "") +
          '" />'
        : '<div class="cat-row-img-placeholder">No img</div>';

      row.innerHTML =
        '<span class="cat-row-num">' +
        (index + 1) +
        '</span><span class="cat-row-name">' +
        (cat.name || "—") +
        '</span>' +
        imageMarkup +
        '<div class="cat-row-actions">' +
        '<button type="button" class="delete-btn" data-id="' +
        cat.id +
        '" title="Delete">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4136" stroke-width="2">' +
        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
        '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' +
        '</svg></button>' +
        '<button type="button" class="edit-btn" data-id="' +
        cat.id +
        '" title="Edit">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">' +
        '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
        '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
        '</svg></button>' +
        "</div>";

      rowsContainer.appendChild(row);
    });
  }

  async function loadCategories() {
    if (!rowsContainer || !hasDatabase()) {
      return;
    }

    rowsContainer.innerHTML =
      '<div class="table-loading">Loading categories...</div>';

    try {
      const snap = await db.ref("categories").once("value");
      allCategories = [];

      if (snap.exists()) {
        snap.forEach(function (child) {
          allCategories.push(Object.assign({ id: child.key }, child.val()));
        });
      }

      setText(document.getElementById("total-category"), allCategories.length);
      renderRows(allCategories);
    } catch (err) {
      console.error("❌ Load error:", err);
      rowsContainer.innerHTML =
        '<div class="table-loading">Failed to load categories.</div>';
    }
  }

  async function uploadCategoryImage(selectedFile) {
    if (!selectedFile) {
      return currentImageUrl || "";
    }

    const formData = new FormData();
    formData.append("image", selectedFile);

    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || data.message || "Upload failed");
    }

    if (!data.success) {
      throw new Error(data.error || data.message || "Upload failed");
    }

    if (
      !data.imageUrl ||
      typeof data.imageUrl !== "string" ||
      !data.imageUrl.startsWith("https://res.cloudinary.com/")
    ) {
      throw new Error("Invalid upload URL received from server.");
    }

    return data.imageUrl;
  }

  function resetModalState() {
    if (categoryForm) {
      categoryForm.reset();
    }
    if (editIdInput) {
      editIdInput.value = "";
    }
    currentImageUrl = "";
    if (imagePreview) {
      imagePreview.src = "";
      imagePreview.style.display = "none";
    }
    setText(imageLabelText, "Choose image file");
  }

  on(document.getElementById("logout-btn"), "click", function () {
    window.location.href = "/admin";
  });

  on(document.getElementById("modal-close"), "click", closeModal);
  on(document.getElementById("btn-cancel"), "click", closeModal);

  on(modalOverlay, "click", function (e) {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  on(document, "keydown", function (e) {
    if (e.key === "Escape" && modalOverlay && modalOverlay.classList.contains("open")) {
      closeModal();
    }
  });

  on(fImage, "change", function () {
    const selectedFile = fImage.files && fImage.files[0];
    if (!selectedFile) return;

    setText(imageLabelText, selectedFile.name);

    const reader = new FileReader();
    reader.onload = function (event) {
      if (imagePreview) {
        imagePreview.src = event.target.result;
        imagePreview.style.display = "block";
      }
    };
    reader.readAsDataURL(selectedFile);
  });

  on(searchInput, "input", function () {
    const query = this.value.toLowerCase();
    renderRows(
      allCategories.filter(function (category) {
        return (category.name || "").toLowerCase().includes(query);
      }),
    );
  });

  on(document.getElementById("add-btn"), "click", function () {
    resetModalState();
    openModal("Add Category");
  });

  on(categoryForm, "submit", async function (e) {
    e.preventDefault();

    if (!hasDatabase()) {
      alert("Database unavailable.");
      return;
    }

    const categoryId = editIdInput ? editIdInput.value.trim() : "";
    const selectedFile = fImage && fImage.files ? fImage.files[0] : null;

    if (!fName || !fName.value.trim()) {
      alert("Please enter a category name.");
      return;
    }

    if (!categoryId && !selectedFile) {
      alert("Please select an image for the category.");
      return;
    }

    setLoading(true, "Saving...");

    try {
      const imageUrl = await uploadCategoryImage(selectedFile);

      const payload = {
        name: fName.value.trim(),
        desc: fDesc ? fDesc.value.trim() : "",
        image: imageUrl,
        updatedAt: new Date().toISOString(),
      };

      if (categoryId) {
        await db.ref("categories/" + categoryId).update(payload);
        alert("✅ Category updated!");
      } else {
        payload.createdAt = new Date().toISOString();
        await db.ref("categories").push(payload);
        alert("✅ Category added!");
      }

      closeModal();
      await loadCategories();
    } catch (err) {
      console.error("❌ Save/upload error:", err);
      alert(err.message || "Failed to save category.");
      setLoading(false, "Save Category");
    }
  });

  on(document, "click", async function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || !hasDatabase()) return;

    const deleteBtn = target.closest(".delete-btn");
    if (deleteBtn) {
      const categoryId = deleteBtn.dataset.id;
      if (!categoryId) return;

      if (!confirm("Delete this category?")) return;

      try {
        await db.ref("categories/" + categoryId).remove();
        alert("✅ Category deleted");
        await loadCategories();
      } catch (err) {
        console.error("❌ Delete error:", err);
        alert("Delete failed");
      }
      return;
    }

    const editBtn = target.closest(".edit-btn");
    if (editBtn) {
      const categoryId = editBtn.dataset.id;
      try {
        const snap = await db.ref("categories/" + categoryId).once("value");
        if (!snap.exists()) {
          alert("Category not found!");
          return;
        }

        const category = snap.val();
        if (editIdInput) editIdInput.value = categoryId;
        if (fName) fName.value = category.name || "";
        if (fDesc) fDesc.value = category.desc || "";
        currentImageUrl = category.image || "";

        if (currentImageUrl && imagePreview) {
          imagePreview.src = currentImageUrl;
          imagePreview.style.display = "block";
          setText(imageLabelText, "Change image (optional)");
        }

        openModal("Edit Category");
      } catch (err) {
        console.error("❌ Edit fetch error:", err);
        alert("Failed to load category data.");
      }
    }
  });

  if (modalOverlay) {
    modalOverlay.addEventListener("transitionend", function () {
      if (!modalOverlay.classList.contains("open")) {
        setLoading(false, "Save Category");
      }
    });
  }

  loadCategories();
});
