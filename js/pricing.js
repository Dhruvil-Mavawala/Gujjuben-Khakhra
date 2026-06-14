// pricing.js - shared country-aware pricing and currency display helpers
(function () {
  const PRICING_CACHE_KEY = "pricing_cache_v2";
  const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const LOCATION_API_URL = "https://ipapi.co/json/";
  const RATES_API_URL = "https://open.er-api.com/v6/latest/INR";

  const SYMBOLS = {
    INR: "\u20b9",
    USD: "$",
    EUR: "\u20ac",
    GBP: "\u00a3",
    AED: "AED ",
    CAD: "C$",
    AUD: "A$",
    SGD: "S$",
    NZD: "NZ$",
  };

  let state = {
    countryCode: "IN",
    countryName: "India",
    currency: "INR",
    rates: { INR: 1 },
    loaded: false,
  };

  let initPromise = null;

  function normalizeCurrency(code) {
    return (
      String(code || "INR")
        .trim()
        .toUpperCase() || "INR"
    );
  }

  function normalizeCountry(code) {
    return (
      String(code || state.countryCode || "IN")
        .trim()
        .toUpperCase() || "IN"
    );
  }

  function parsePositiveNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
  }

  function safeParseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function readCache() {
    const parsed = safeParseJson(localStorage.getItem(PRICING_CACHE_KEY));
    if (!parsed || typeof parsed !== "object") return null;
    const age = Date.now() - (parsed.timestamp || 0);
    if (age < 0 || age > PRICING_CACHE_TTL_MS) return null;
    return parsed.data || null;
  }

  function writeCache(data) {
    localStorage.setItem(
      PRICING_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
  }

  function dispatchPricingReady() {
    try {
      window.dispatchEvent(
        new CustomEvent("pricing-ready", { detail: getPricingState() }),
      );
    } catch {
      window.dispatchEvent(new Event("pricing-ready"));
    }
  }

  function resolveIndiaPrice(product) {
    return parsePositiveNumber(product?.indiaPrice ?? product?.price, 0);
  }

  function resolveInternationalPrice(product) {
    const indiaPrice = resolveIndiaPrice(product);
    return parsePositiveNumber(product?.internationalPrice, indiaPrice);
  }

  function getBasePrice(product, countryCode) {
    return normalizeCountry(countryCode) === "IN"
      ? resolveIndiaPrice(product)
      : resolveInternationalPrice(product);
  }

  function getDisplayPrice(product, countryCode, currencyCode) {
    const basePrice = getBasePrice(product, countryCode || state.countryCode);
    return convertCurrency(basePrice, currencyCode || state.currency);
  }

  function getCurrencySymbol(currencyCode) {
    const code = normalizeCurrency(currencyCode);
    return SYMBOLS[code] || code + " ";
  }

  function formatCurrencyAmount(amount, currencyCode) {
    const code = normalizeCurrency(currencyCode || state.currency);
    return getCurrencySymbol(code) + (parseFloat(amount) || 0).toFixed(2);
  }

  function formatBasePrice(product, countryCode, currencyCode) {
    const currency = normalizeCurrency(currencyCode || state.currency);
    const displayAmount = getDisplayPrice(
      product,
      countryCode || state.countryCode,
      currency,
    );
    return formatCurrencyAmount(displayAmount, currency);
  }

  async function detectCountry() {
    try {
      const res = await fetch(LOCATION_API_URL);
      if (!res.ok) throw new Error("Location API failed");
      const data = await res.json();
      return {
        countryCode: normalizeCountry(data.country_code || "IN"),
        countryName: data.country_name || "India",
        currency: normalizeCurrency(data.currency || "INR"),
      };
    } catch {
      return {
        countryCode: "IN",
        countryName: "India",
        currency: "INR",
      };
    }
  }

  

  async function fetchRates() {
    try {
      const res = await fetch(RATES_API_URL);
      if (!res.ok) throw new Error("Rates API failed");
      const data = await res.json();
      const rates =
        data?.rates && typeof data.rates === "object" ? data.rates : null;
      if (!rates || !Object.keys(rates).length)
        throw new Error("Invalid rates payload");
      rates.INR = 1;
      return rates;
    } catch {
      return { INR: 1 };
    }
  }

  function convertCurrency(amountInInr, targetCurrency) {
    const currency = normalizeCurrency(targetCurrency || state.currency);
    const amount = parseFloat(amountInInr) || 0;
    if (currency === "INR") return amount;
    const rate = parseFloat(state.rates[currency]);
    return Number.isFinite(rate) && rate > 0 ? amount * rate : amount;
  }

  async function formatProductPrice(product) {
    await initPricing();
    return formatBasePrice(product, state.countryCode, state.currency);
  }

  function calculateOrderTotalINR(items, countryCode) {
    const code = normalizeCountry(countryCode || state.countryCode);
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      return (
        sum +
        getBasePrice(item, code) *
          (parseInt(item.quantity ?? item.qty ?? 1, 10) || 1)
      );
    }, 0);
  }

  function getPricingState() {
    return {
      countryCode: state.countryCode,
      countryName: state.countryName,
      currency: state.currency,
      rates: Object.assign({}, state.rates),
      loaded: !!state.loaded,
    };
  }

  async function initPricing() {
    if (initPromise) return initPromise;

    initPromise = (async function () {
      const cached = readCache();
      if (cached) {
        state.countryCode = normalizeCountry(cached.countryCode);
        state.countryName = cached.countryName || "India";
        state.currency = normalizeCurrency(cached.currency);
        state.rates =
          cached.rates && typeof cached.rates === "object"
            ? cached.rates
            : { INR: 1 };
        state.rates.INR = 1;
      } else {
        const location = await detectCountry();
        const rates = await fetchRates();
        state.countryCode = location.countryCode;
        state.countryName = location.countryName;
        state.currency = location.currency;
        state.rates = rates;
        state.rates.INR = 1;
        writeCache({
          countryCode: state.countryCode,
          countryName: state.countryName,
          currency: state.currency,
          rates: state.rates,
        });
      }

      state.loaded = true;
      window.userCountry = state.countryName;
      window.userCountryCode = state.countryCode;
      window.userCurrency = state.currency;
      dispatchPricingReady();
      return getPricingState();
    })();

    return initPromise;
  }

  window.detectCountry = detectCountry;
  window.fetchRates = fetchRates;
  window.convertCurrency = convertCurrency;
  window.formatProductPrice = formatProductPrice;
  window.formatCurrencyAmount = formatCurrencyAmount;
  window.formatBasePrice = formatBasePrice;
  window.getDisplayPrice = getDisplayPrice;
  window.getBasePrice = getBasePrice;
  window.calculateOrderTotalINR = calculateOrderTotalINR;
  window.resolveIndiaPrice = window.resolveIndiaPrice || resolveIndiaPrice;
  window.resolveInternationalPrice =
    window.resolveInternationalPrice || resolveInternationalPrice;
  window.getCurrencySymbol = getCurrencySymbol;
  window.getPricingState = getPricingState;
  window.initPricing = initPricing;

  initPricing().catch(function (err) {
    console.error("Pricing init failed:", err);
  });
})();
