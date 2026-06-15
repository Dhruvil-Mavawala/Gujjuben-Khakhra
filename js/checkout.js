// checkout.js - Gujjuben's Khakhra Checkout
// International checkout upgrade: phone, postal lookup, validation, and order payload.

const firebaseConfig = {
  apiKey: "AIzaSyD-rgB6-m-YE3EFHR_FACe7afVmqduyOps",
  authDomain: "khakhra-5cb3d.firebaseapp.com",
  databaseURL: "https://khakhra-5cb3d-default-rtdb.firebaseio.com",
  projectId: "khakhra-5cb3d",
  storageBucket: "khakhra-5cb3d.appspot.com",
  messagingSenderId: "713999821089",
  appId: "1:713999821089:web:f0c25da51cff322d61b660",
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user || !user.id) {
  window.location.replace("/login?redirect=/checkout");
}

const DELIVERY_ESTIMATES = {
  IN: "3-5 business days",
  INTL: "10-15 business days",
};

const COUNTRY_PRIORITY = ["IN", "US", "GB", "AE", "CA", "AU", "SG", "NZ"];
const COUNTRY_FALLBACKS = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["AE", "United Arab Emirates"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["SG", "Singapore"],
  ["NZ", "New Zealand"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["SE", "Sweden"],
  ["NO", "Norway"],
  ["CH", "Switzerland"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["MY", "Malaysia"],
  ["ZA", "South Africa"],
];

let ipCountryCode = null;
let ipCountryName = null;
let shippingCountry = null;
let isSuspicious = false;
let pricingReady = false;
let cartItems = [];
let productPricingMap = {};
let phoneInput = null;
let postalLookupTimer = null;

const form = document.getElementById("checkout-form");
const payBtn = document.getElementById("co-pay-btn");
const payBtnText = document.getElementById("co-pay-btn-text");
const paySpinner = document.getElementById("co-pay-spinner");
const formError = document.getElementById("co-form-error");
const locationBanner = document.getElementById("location-banner");
const locationText = document.getElementById("location-banner-text");
const deliveryEst = document.getElementById("delivery-estimate");
const countrySelect = document.getElementById("co-country");
const summaryItems = document.getElementById("co-summary-items");
const subtotalEl = document.getElementById("co-subtotal");
const shippingEl = document.getElementById("co-shipping");
const totalEl = document.getElementById("co-total");
const currencyNote = document.getElementById("co-currency-note");
const postalInput = document.getElementById("co-postal");
const postalSpinner = document.getElementById("co-postal-spinner");
const postalStatus = document.getElementById("co-postal-status");
const editManualBtn = document.getElementById("co-edit-manual");
const cityInput = document.getElementById("co-city");
const stateInput = document.getElementById("co-state");

function setPayBtnLoading(loading) {
  payBtn.disabled = loading;
  payBtnText.style.display = loading ? "none" : "inline";
  paySpinner.style.display = loading ? "inline-block" : "none";
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.style.display = msg ? "block" : "none";
}

function markField(id, valid, msg) {
  const input = document.getElementById(id);
  const err = document.getElementById("err-" + id.replace("co-", ""));
  if (!input) return;
  input.classList.toggle("valid", valid);
  input.classList.toggle("invalid", !valid);
  if (err) err.textContent = valid ? "" : msg || "Required";
}

function clearField(id) {
  const input = document.getElementById(id);
  const err = document.getElementById("err-" + id.replace("co-", ""));
  if (input) input.classList.remove("valid", "invalid");
  if (err) err.textContent = "";
}

function setPostalLoading(loading) {
  if (postalSpinner)
    postalSpinner.style.display = loading ? "inline-block" : "none";
}

function setPostalStatus(message, tone) {
  if (!postalStatus) return;
  postalStatus.textContent = message || "";
  postalStatus.className = "co-lookup-status" + (tone ? " is-" + tone : "");
}

function getRegionNames() {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    if (!Intl.supportedValuesOf)
      throw new Error("supportedValuesOf unavailable");
    return Intl.supportedValuesOf("region")
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .map((code) => [code, displayNames.of(code) || code]);
  } catch {
    return COUNTRY_FALLBACKS;
  }
}

function countryFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "";
  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function populateCountrySelect() {
  if (!countrySelect) return;

  const seen = new Set();
  const countries = getRegionNames()
    .filter(([code]) => !seen.has(code) && seen.add(code))
    .sort((a, b) => {
      const ai = COUNTRY_PRIORITY.indexOf(a[0]);
      const bi = COUNTRY_PRIORITY.indexOf(b[0]);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a[1].localeCompare(b[1]);
    });

  countrySelect.innerHTML =
    '<option value="">Select country...</option>' +
    countries
      .map(
        ([code, name]) =>
          `<option value="${code}">${countryFlag(code)} ${escapeHtml(name)}</option>`,
      )
      .join("");
}

function getCountryName(code) {
  if (!code) return "";
  const option = countrySelect?.querySelector(
    `option[value="${String(code).toUpperCase()}"]`,
  );
  if (option) return option.textContent.replace(/^[^\w(]+/u, "").trim();
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(
        String(code).toUpperCase(),
      ) || code
    );
  } catch {
    return code;
  }
}

async function detectIPCountry() {
  try {
    await initPricing();
    ipCountryCode = String(window.userCountryCode || "IN").toUpperCase();
    ipCountryName =
      window.userCountry || getCountryName(ipCountryCode) || "India";
  } catch {
    ipCountryCode = "IN";
    ipCountryName = "India";
  }

  locationText.textContent = `Detected location: ${ipCountryName} (${ipCountryCode})`;

  if (countrySelect && ipCountryCode) {
    countrySelect.value = ipCountryCode;
    handleCountryChange(ipCountryCode, { syncPhone: false });
  }
}

function initPhoneInput() {
  const input = document.getElementById("co-phone");
  if (!input || !window.intlTelInput) return;

  phoneInput = window.intlTelInput(input, {
    initialCountry: (ipCountryCode || "IN").toLowerCase(),
    separateDialCode: true,
    countrySearch: true,
    dropdownParent: document.body,
    loadUtils: () =>
      import("https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.0/build/js/utils.js"),
  });

  input.addEventListener("countrychange", () => {
    const data = phoneInput.getSelectedCountryData() || {};
    document.getElementById("co-dial-code").value = data.dialCode
      ? "+" + data.dialCode
      : "";
    document.getElementById("co-phone-country").value = (
      data.iso2 || ""
    ).toUpperCase();
    clearField("co-phone");
  });

  const data = phoneInput.getSelectedCountryData() || {};
  document.getElementById("co-dial-code").value = data.dialCode
    ? "+" + data.dialCode
    : "";
  document.getElementById("co-phone-country").value = (
    data.iso2 || ""
  ).toUpperCase();
}

function setPhoneCountry(code) {
  if (!phoneInput || !code) return;
  phoneInput.setCountry(String(code).toLowerCase());
}

function getPhoneData() {
  const raw = document.getElementById("co-phone")?.value.trim() || "";
  const selected = phoneInput?.getSelectedCountryData?.() || {};
  const dialCode = selected.dialCode ? "+" + selected.dialCode : "";
  const fullInternationalPhone =
    phoneInput?.getNumber?.() || dialCode + raw.replace(/\D/g, "");

  return {
    country: getCountryName(
      (selected.iso2 || shippingCountry || "").toUpperCase(),
    ),
    countryCode: (selected.iso2 || "").toUpperCase(),
    dialCode,
    phone: raw.replace(/[^\d]/g, ""),
    fullInternationalPhone,
  };
}

function handleCountryChange(code, options = {}) {
  shippingCountry = code || null;
  const isIndia = code === "IN";

  if (postalInput) {
    postalInput.placeholder = isIndia ? "6-digit pincode" : "ZIP / Postal Code";
    postalInput.inputMode = isIndia ? "numeric" : "text";
    postalInput.maxLength = isIndia ? 6 : 20;
  }

  if (code && options.syncPhone !== false) setPhoneCountry(code);

  deliveryEst.textContent = code
    ? isIndia
      ? DELIVERY_ESTIMATES.IN
      : DELIVERY_ESTIMATES.INTL
    : "Select country to see estimate";

  clearField("co-country");
  clearField("co-postal");
  validateSecurity();
  updateSummary();
  updatePayButton();

  if (postalInput?.value.trim()) queuePostalLookup();
}

function validateSecurity() {
  if (!ipCountryCode || !shippingCountry) {
    isSuspicious = false;
    locationBanner.className = "co-location-banner";
    return;
  }

  const ipIsIndia = ipCountryCode === "IN";
  const shippingIsIndia = shippingCountry === "IN";
  isSuspicious = ipIsIndia !== shippingIsIndia;

  if (isSuspicious) {
    locationBanner.className = "co-location-banner co-location-banner--warning";
    locationText.textContent = `Location mismatch: IP from ${ipCountryName} (${ipCountryCode}), shipping to ${getCountryName(shippingCountry)} (${shippingCountry})`;
    showSecurityModal();
  } else {
    locationBanner.className = "co-location-banner";
    locationText.textContent = `Location verified: ${ipCountryName} (${ipCountryCode})`;
  }
}

function showSecurityModal() {
  const modal = document.getElementById("security-modal");
  const detail = document.getElementById("security-modal-detail");
  detail.textContent = `IP Country: ${ipCountryName} (${ipCountryCode}) | Shipping Country: ${getCountryName(shippingCountry)} (${shippingCountry})`;
  modal.style.display = "flex";
}

document
  .getElementById("security-modal-close")
  ?.addEventListener("click", () => {
    document.getElementById("security-modal").style.display = "none";
  });

function enableManualAddress(message) {
  [cityInput, stateInput, countrySelect].forEach((input) => {
    if (input) input.disabled = false;
  });
  setPostalStatus(
    message || "Enter city, state, and country manually.",
    "warning",
  );
}

async function lookupPostalAddress() {
  const postalCode = postalInput?.value.trim();
  const countryCode = shippingCountry;

  if (!postalCode || !countryCode) return;
  if (countryCode === "IN" && !/^\d{6}$/.test(postalCode)) return;

  setPostalLoading(true);
  setPostalStatus("Looking up postal code...");

  try {
    let result = null;

    if (countryCode === "IN") {
      const res = await fetch(
        `https://api.postalpincode.in/pincode/${encodeURIComponent(postalCode)}`,
      );
      const data = await res.json();
      const record = data?.[0];
      const office = record?.PostOffice?.[0];
      if (record?.Status === "Success" && office) {
        result = {
          city: office.District || office.Block || office.Name || "",
          state: office.State || "",
          country: "India",
          countryCode: "IN",
        };
      }
    } else {
      const res = await fetch(
        `https://api.zippopotam.us/${countryCode.toLowerCase()}/${encodeURIComponent(postalCode)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const place = data?.places?.[0];
        if (place) {
          result = {
            city: place["place name"] || "",
            state: place.state || place["state abbreviation"] || "",
            country: data.country || getCountryName(countryCode),
            countryCode: (
              data["country abbreviation"] || countryCode
            ).toUpperCase(),
          };
        }
      }
    }

    if (!result) {
      enableManualAddress(
        "Postal lookup failed. You can enter the address manually.",
      );
      return;
    }

    if (cityInput && result.city) cityInput.value = result.city;
    if (stateInput && result.state) stateInput.value = result.state;
    if (countrySelect && result.countryCode) {
      countrySelect.value = result.countryCode;
      shippingCountry = result.countryCode;
    }

    markField("co-postal", true);
    if (result.city) markField("co-city", true);
    if (result.state) markField("co-state", true);
    if (result.countryCode) markField("co-country", true);
    setPostalStatus(
      "Postal code found. City, state, and country filled.",
      "success",
    );
    validateSecurity();
    updateSummary();
  } catch (err) {
    console.warn("[Checkout] Postal lookup failed:", err);
    enableManualAddress(
      "Postal lookup failed. You can enter the address manually.",
    );
  } finally {
    setPostalLoading(false);
  }
}

function queuePostalLookup() {
  clearTimeout(postalLookupTimer);
  postalLookupTimer = setTimeout(lookupPostalAddress, 450);
}

async function loadCartData() {
  cartItems = getCart();

  try {
    const snap = await db.ref("products").once("value");
    snap.forEach((child) => {
      const p = child.val() || {};
      productPricingMap[child.key] = {
        indiaPrice: parseFloat(p.indiaPrice ?? p.price) || 0,
        internationalPrice:
          parseFloat(p.internationalPrice ?? p.indiaPrice ?? p.price) || 0,
      };
    });
  } catch (err) {
    console.warn("[Checkout] Could not load product pricing:", err);
  }

  renderSummaryItems();
  updateSummary();
}

function renderSummaryItems() {
  if (!cartItems.length) {
    summaryItems.innerHTML = `<div class="co-summary__loading">Your cart is empty. <a href="/productlist">Shop now</a></div>`;
    payBtn.disabled = true;
    return;
  }

  summaryItems.innerHTML = cartItems
    .map((item) => {
      const displayPrice = formatDisplayPrice(getItemBasePriceINR(item));
      return `
      <div class="co-summary__item">
        <img class="co-summary__item-img"
             src="${escapeHtml(item.image || "")}"
             alt="${escapeHtml(item.name)}"
             onerror="this.style.background='#f0f0f0';this.src=''" />
        <div class="co-summary__item-info">
          <div class="co-summary__item-name">${escapeHtml(item.name)}</div>
          <div class="co-summary__item-qty">Qty: ${item.quantity}</div>
        </div>
        <div class="co-summary__item-price">${displayPrice}</div>
      </div>`;
    })
    .join("");
}

function getItemPricing(item) {
  const mapped = productPricingMap[item.id] || {};
  return {
    indiaPrice:
      parseFloat(mapped.indiaPrice ?? item.indiaPrice ?? item.price) || 0,
    internationalPrice:
      parseFloat(
        mapped.internationalPrice ??
          item.internationalPrice ??
          mapped.indiaPrice ??
          item.indiaPrice ??
          item.price,
      ) || 0,
  };
}

function getPricingCountryCode() {
  return String(
    shippingCountry || ipCountryCode || window.userCountryCode || "IN",
  ).toUpperCase();
}

function getItemBasePriceINR(item) {
  const pricing = getItemPricing(item);

  if (getPricingCountryCode() === "IN") {
    return pricing.indiaPrice;
  }

  return pricing.internationalPrice;
}

function formatDisplayPrice(baseAmountINR) {
  if (!pricingReady || !window.userCurrency || window.userCurrency === "INR") {
    return "\u20b9" + parseFloat(baseAmountINR).toFixed(2);
  }
  const converted = convertCurrency(
    parseFloat(baseAmountINR) || 0,
    window.userCurrency,
  );
  return formatCurrencyAmount(converted, window.userCurrency);
}

function updateSummary() {
  if (!cartItems.length) return;

  const subtotalINR = calculateOrderTotalINR();
  console.log("[Checkout Currency]", window.userCurrency, subtotalINR);

  subtotalEl.textContent = formatDisplayPrice(subtotalINR);
  shippingEl.textContent = "Free";
  totalEl.textContent = formatDisplayPrice(subtotalINR);

  currencyNote.textContent =
    pricingReady && window.userCurrency && window.userCurrency !== "INR"
      ? `Free Shipping Worldwide. Prices shown in ${window.userCurrency}. Payment processed in INR.`
      : "Free Shipping Worldwide";
}

function updatePayButton() {
  payBtn.disabled = !cartItems.length || !shippingCountry;
}

function validatePhone() {
  const phone = document.getElementById("co-phone")?.value.trim();
  if (!phone) {
    markField("co-phone", false, "Phone number is required.");
    return false;
  }

  if (phoneInput?.isValidNumber && !phoneInput.isValidNumber()) {
    markField(
      "co-phone",
      false,
      "Enter a valid phone number for the selected country.",
    );
    return false;
  }

  markField("co-phone", true);
  return true;
}

function validateForm() {
  let valid = true;
  const name = document.getElementById("co-name")?.value.trim();
  const addr1 = document.getElementById("co-addr1")?.value.trim();
  const city = cityInput?.value.trim();
  const state = stateInput?.value.trim();
  const postalCode = postalInput?.value.trim();

  if (!name) {
    markField("co-name", false, "Full name is required.");
    valid = false;
  } else {
    markField("co-name", true);
  }

  if (!validatePhone()) valid = false;

  if (!addr1) {
    markField("co-addr1", false, "Address Line 1 is required.");
    valid = false;
  } else {
    markField("co-addr1", true);
  }

  if (!shippingCountry) {
    markField("co-country", false, "Please select a shipping country.");
    valid = false;
  } else {
    markField("co-country", true);
  }

  if (!city) {
    markField("co-city", false, "City is required.");
    valid = false;
  } else {
    markField("co-city", true);
  }

  if (!state) {
    markField("co-state", false, "State / Province is required.");
    valid = false;
  } else {
    markField("co-state", true);
  }

  if (!postalCode) {
    markField("co-postal", false, "ZIP / Postal Code is required.");
    valid = false;
  } else if (shippingCountry === "IN" && !/^\d{6}$/.test(postalCode)) {
    markField("co-postal", false, "Enter a valid 6-digit Indian pincode.");
    valid = false;
  } else {
    markField("co-postal", true);
  }

  return valid;
}

function buildShippingAddress() {
  const phone = getPhoneData();
  return {
    address1: document.getElementById("co-addr1")?.value.trim() || "",
    address2: document.getElementById("co-addr2")?.value.trim() || "",
    addressLine1: document.getElementById("co-addr1")?.value.trim() || "",
    addressLine2: document.getElementById("co-addr2")?.value.trim() || "",
    city: cityInput?.value.trim() || "",
    state: stateInput?.value.trim() || "",
    country: getCountryName(shippingCountry),
    countryCode: shippingCountry,
    dialCode: phone.dialCode,
    phone: phone.phone,
    fullInternationalPhone: phone.fullInternationalPhone,
    postalCode: postalInput?.value.trim() || "",
  };
}

function buildOrderItems() {
  return cartItems.map((item) => {
    const p = getItemPricing(item);
    return {
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      indiaPrice: p.indiaPrice,
      internationalPrice: p.internationalPrice,
      finalPrice: getItemBasePriceINR(item),
      image: item.image || "",
    };
  });
}

function calculateTotals() {
  const subtotalINR = calculateOrderTotalINR();
  const shipping = 0;
  const totalINR = subtotalINR;
  return { subtotalINR, shipping, totalINR };
}

function calculateOrderTotalINR() {
  return cartItems.reduce((sum, item) => {
    return sum + getItemBasePriceINR(item) * item.quantity;
  }, 0);
}

async function createOrder(paymentMethod, paymentStatus, razorpayPaymentId) {
  const items = buildOrderItems();
  const address = buildShippingAddress();
  const phone = getPhoneData();
  const { subtotalINR, totalINR } = calculateTotals();

  const currency = window.userCurrency || "INR";
  const exchangeRate =
    currency !== "INR" && window.convertCurrency
      ? window.convertCurrency(1, currency)
      : 1;

  const orderRef = db.ref("orders").push();
  const orderId = orderRef.key;

  const orderData = {
    orderId,
    userId: user.id,
    customerName: document.getElementById("co-name")?.value.trim() || "",
    customerEmail: user.email || "",
    customerPhone: phone.fullInternationalPhone || phone.phone,
    country: getCountryName(shippingCountry),
    dialCode: phone.dialCode,
    phone: phone.phone,
    fullInternationalPhone: phone.fullInternationalPhone,
    postalCode: address.postalCode,
    city: address.city,
    state: address.state,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    shippingAddress: address,
    ipCountry: ipCountryCode || "UNKNOWN",
    ipCountryName: ipCountryName || "Unknown",
    shippingCountry,
    suspicious: isSuspicious,
    currency,
    exchangeRate,
    subtotal: subtotalINR,
    shipping: 0,
    totalAmount: totalINR,
    items,
    paymentMethod,
    paymentStatus,
    razorpayPaymentId: razorpayPaymentId || null,
    orderStatus: "confirmed",
    status: 2,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  };

  await orderRef.set(orderData);
  saveCart([]);
  return orderId;
}

function showPaymentModal() {
  const { totalINR } = calculateTotals();
  launchRazorpay(totalINR);
}

function closePaymentModal() {
  document.getElementById("payment-modal").style.display = "none";
}

document
  .getElementById("payment-modal-close")
  ?.addEventListener("click", closePaymentModal);

document.getElementById("pay-online")?.addEventListener("click", () => {
  closePaymentModal();
  const { totalINR } = calculateTotals();
  launchRazorpay(totalINR);
});

async function launchRazorpay(totalINR) {
  const API = window.APP_CONFIG?.API_BASE_URL;
  const razorpayKey = window.APP_CONFIG?.RAZORPAY_KEY_ID;

  if (!API || !razorpayKey) {
    showFormError("Payment configuration missing. Please contact support.");
    return;
  }

  setPayBtnLoading(true);
  showFormError("");

  let rzpOrder;
  // Render free tier cold-starts can return non-JSON. Retry once after a short wait.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalINR,
          amountPaise: Math.round(totalINR * 100),
        }),
      });

      // Guard: ensure response is JSON before parsing
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        if (attempt === 1) {
          console.warn(
            "[Checkout] Non-JSON on attempt 1, retrying in 4s:",
            text.slice(0, 120),
          );
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        throw new Error(
          "Payment server is starting up. Please wait a moment and try again.",
        );
      }

      const data = await res.json();
      if (!res.ok || !data.success || !data.order?.id) {
        throw new Error(data.error || "Could not create payment order.");
      }
      rzpOrder = data.order;
      break; // success — exit retry loop
    } catch (err) {
      if (attempt < 2 && err.message.includes("starting up")) {
        // will retry
        continue;
      }
      console.error("[Checkout] create-order failed:", err);
      showFormError("Payment unavailable: " + err.message);
      setPayBtnLoading(false);
      return;
    }
  }

  const phone = getPhoneData();
  const options = {
    key: razorpayKey,
    order_id: rzpOrder.id,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    name: "Gujjuben's Khakhra",
    description: "Order Payment",
    image: "/assets/images/union0.svg",
    prefill: {
      name: document.getElementById("co-name")?.value.trim() || "",
      email: user.email || "",
      contact: phone.fullInternationalPhone || phone.phone,
    },
    theme: { color: "#0b8f3c" },
    handler: async function (response) {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        response;
      setPayBtnLoading(true);
      showFormError("");

      try {
        const verifyRes = await fetch(`${API}/verify-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error || "Payment verification failed.");
        }
      } catch (err) {
        console.error("[Checkout] Verification failed:", err);
        showFormError(
          "Payment received but verification failed. Contact support. Payment ID: " +
            razorpay_payment_id,
        );
        setPayBtnLoading(false);
        return;
      }

      try {
        const orderId = await createOrder(
          "ONLINE",
          "Paid",
          razorpay_payment_id,
        );
        window.location.href = "/order-success?orderId=" + orderId;
      } catch (err) {
        console.error("[Checkout] Firebase order save failed:", err);
        showFormError(
          "Payment verified but order save failed. Contact support with payment ID: " +
            razorpay_payment_id,
        );
        setPayBtnLoading(false);
      }
    },
    modal: {
      ondismiss: () => {
        setPayBtnLoading(false);
      },
    },
  };

  try {
    setPayBtnLoading(false);
    new Razorpay(options).open();
  } catch (err) {
    console.error("[Checkout] Razorpay init failed:", err);
    showFormError("Payment gateway unavailable. Please try again.");
    setPayBtnLoading(false);
  }
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  showFormError("");

  if (!validateForm()) {
    showFormError("Please fix the errors above before continuing.");
    return;
  }

  if (isSuspicious) {
    showSecurityModal();
    return;
  }

  if (!cartItems.length) {
    showFormError("Your cart is empty.");
    return;
  }

  showPaymentModal();
});

countrySelect?.addEventListener("change", (e) => {
  handleCountryChange(e.target.value);
});

postalInput?.addEventListener("input", () => {
  clearField("co-postal");
  setPostalStatus("");
  queuePostalLookup();
});

editManualBtn?.addEventListener("click", () => {
  enableManualAddress("Manual editing enabled.");
  cityInput?.focus();
});

["co-name", "co-addr1", "co-city", "co-state"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => clearField(id));
});

document
  .getElementById("co-phone")
  ?.addEventListener("input", () => clearField("co-phone"));

window.addEventListener("pricing-ready", () => {
  pricingReady = true;
  renderSummaryItems();
  updateSummary();
});

window.addEventListener("cart-updated", () => {
  cartItems = getCart();
  renderSummaryItems();
  updateSummary();
  updatePayButton();
});

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

(async function init() {
  populateCountrySelect();
  await detectIPCountry();
  initPhoneInput();
  await loadCartData();
  updatePayButton();

  if (window.userCurrency) {
    pricingReady = true;
    updateSummary();
  }

  // Ping the backend now so Render's free tier is warm by the time the user pays
  const API = window.APP_CONFIG?.API_BASE_URL;
  if (API) {
    fetch(`${API}/ping`, { method: "GET" }).catch(() => {});
  }
})();
