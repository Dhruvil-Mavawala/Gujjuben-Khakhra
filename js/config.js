const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://gujjukhaka.netlify.app",
  "https://gujjubenskhakhra.infinityfree.io"
];

app.use(cors({
  origin: function (origin, callback) {

    // Allow Postman, curl, server-to-server requests
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS not allowed"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());