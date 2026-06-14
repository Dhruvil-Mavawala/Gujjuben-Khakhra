const express = require("express");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const Razorpay = require("razorpay");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// ── Load .env in development ──────────────────
// On Render (production), env vars are set in the dashboard.
// Locally, they come from .env via dotenv.
try {
  require("dotenv").config();
} catch (_) {
  /* dotenv optional */
}

const app = express();

// ── Middleware ────────────────────────────────
const allowedOrigins = [
  "https://gujjukhaka.netlify.app",
  "https://www.gujjukhaka.netlify.app",
  "https://gujjubenskhakhra.infinityfree.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("Blocked Origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

// Handle preflight OPTIONS requests before any other middleware
app.use(cors(corsOptions));
app.use(express.json());

// ── Credentials (from environment only) ──────
const MC_CUSTOMER_ID = process.env.MC_CUSTOMER_ID;
const MC_AUTH_TOKEN = process.env.MC_AUTH_TOKEN;
const MC_BASE_URL = "https://cpaas.messagecentral.com";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ── Razorpay instance ─────────────────────────
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || "",
  key_secret: RAZORPAY_KEY_SECRET || "",
});

console.log("Razorpay Config Loaded");

// Guard: warn loudly if secrets are missing at startup
if (!MC_CUSTOMER_ID || !MC_AUTH_TOKEN) {
  console.warn(
    "⚠️  MC_CUSTOMER_ID or MC_AUTH_TOKEN not set. OTP endpoints will fail.",
  );
}
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn(
    "⚠️  RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set. Payment endpoints will fail.",
  );
}

// ── POST /send-otp ────────────────────────────
// Body: { phone }  →  Returns: { verificationId }
app.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone || !/^\d{10}$/.test(phone)) {
    return res
      .status(400)
      .json({ error: "Valid 10-digit phone number is required." });
  }

  try {
    const response = await axios.post(
      `${MC_BASE_URL}/verification/v3/send`,
      {},
      {
        params: {
          countryCode: "91",
          customerId: MC_CUSTOMER_ID,
          flowType: "SMS",
          mobileNumber: phone,
          otpLength: 4,
        },
        headers: {
          authToken: MC_AUTH_TOKEN,
          "Content-Type": "application/json",
        },
      },
    );

    const verificationId = response.data?.data?.verificationId;

    if (!verificationId) {
      console.error("MC send-otp unexpected response:", response.data);
      return res
        .status(502)
        .json({ error: "Failed to send OTP. Please try again." });
    }

    console.log(`OTP sent to ${phone}, verificationId: ${verificationId}`);
    return res.json({ verificationId });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error("send-otp error:", msg);
    return res.status(502).json({ error: "Failed to send OTP: " + msg });
  }
});

// ── POST /verify-otp ──────────────────────────
// Body: { phone, verificationId, code }  →  Returns: { success: true }
app.post("/verify-otp", async (req, res) => {
  const { phone, verificationId, code } = req.body;

  if (!phone || !verificationId || !code) {
    return res
      .status(400)
      .json({ error: "phone, verificationId and code are all required." });
  }

  try {
    const response = await axios.get(
      `${MC_BASE_URL}/verification/v3/validateOtp`,
      {
        params: {
          countryCode: "91",
          mobileNumber: phone,
          verificationId: verificationId,
          customerId: MC_CUSTOMER_ID,
          code: code,
        },
        headers: {
          authToken: MC_AUTH_TOKEN,
        },
      },
    );

    if (response.data?.responseCode === 200) {
      return res.json({ success: true });
    }

    const mcMsg = response.data?.message || "Invalid OTP.";
    return res.status(400).json({ error: mcMsg });
  } catch (err) {
    const mcMsg = err.response?.data?.message || err.message;
    console.error("verify-otp error:", mcMsg);
    return res.status(400).json({ error: mcMsg || "Invalid or expired OTP." });
  }
});

// ── POST /create-order ────────────────────────
// Body: { amount }  (amount in INR, as a number)
// Returns: { success: true, order }
app.post("/create-order", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const amountPaiseFromBody = parseInt(req.body.amountPaise, 10);

  if (
    (!amount || amount <= 0) &&
    (!amountPaiseFromBody || amountPaiseFromBody <= 0)
  ) {
    return res.status(400).json({ error: "Valid amount (INR) is required." });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payment gateway not configured." });
  }

  try {
    const options = {
      amount:
        amountPaiseFromBody > 0
          ? amountPaiseFromBody
          : Math.round(amount * 100),
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    console.log("[create-order] Created:", order.id, "amount:", order.amount);
    return res.json({ success: true, order });
  } catch (err) {
    console.error("[create-order] Razorpay error:", err);
    return res
      .status(502)
      .json({
        error:
          err.error?.description || err.message || "Order creation failed.",
      });
  }
});

// ── POST /verify-payment ──────────────────────
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
app.post("/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res
      .status(400)
      .json({ error: "Missing payment verification fields." });
  }

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(razorpay_signature, "utf8");

  if (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return res.json({ success: true });
  }
  return res.status(400).json({ error: "Payment verification failed." });
});

// ─────────────────────────────────────────────
// CLOUDINARY IMAGE UPLOAD
// ─────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn(
    "⚠️  Cloudinary environment variables are missing. Image uploads will fail until they are configured.",
  );
}

// Use memory storage — buffer uploaded to Cloudinary via stream
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: function (req, file, cb) {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Invalid file type. Only JPG, PNG and WEBP are allowed."),
      );
    }
    cb(null, true);
  },
});

// Helper: upload buffer to Cloudinary via upload_stream
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "khakhra-products" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// Upload route
app.post("/upload", function (req, res) {
  upload.single("image")(req, res, async function (err) {
    if (err) {
      console.error("Upload error:", err);
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File too large. Max allowed size is 10MB.",
        });
      }
      return res.status(500).json({
        success: false,
        error: err.message || "Upload failed",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    try {
      const result = await uploadToCloudinary(req.file.buffer);
      if (!result || !result.secure_url) {
        return res.status(502).json({
          success: false,
          error: "Cloudinary did not return a URL.",
        });
      }
      return res.json({
        success: true,
        imageUrl: result.secure_url,
      });
    } catch (uploadErr) {
      console.error("Cloudinary upload error:", uploadErr);
      return res.status(502).json({
        success: false,
        error: uploadErr.message || "Cloudinary upload failed.",
      });
    }
  });
});

// ── Serve static files ────────────────────────
const pageRoutes = {
  "/about": "about.html",
  "/admin-orders": "admin-orders.html",
  "/admin": "admin.html",
  "/auth": "auth.html",
  "/cart": "cart.html",
  "/category-admin": "category-admin.html",
  "/checkout": "checkout.html",
  "/dashboard": "dashboard.html",
  "/deal": "deal.html",
  "/login": "login.html",
  "/order-success": "order-success.html",
  "/orders": "orders.html",
  "/otp": "otp.html",
  "/prod": "prod.html",
  "/product-detail": "product-detail.html",
  "/product-details": "product-details.html",
  "/productlist": "productlist.html",
  "/products-admin": "products-admin.html",
  "/sso-callback": "sso-callback.html",
  "/inquiry-admin": "inquiry-admin.html",
  "/tracking": "tracking.html",
};

Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, file));
  });
});

app.use(express.static(__dirname));

// ── Start server ──────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`),
);
