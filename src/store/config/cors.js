const cors = require("cors");

const allowedOrigins = process.env.STORE_CORS_ALLOWED_ORIGINS
  ? process.env.STORE_CORS_ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    // Wildcard allows all origins
    if (allowedOrigins.includes("*")) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error(`CORS blocked for origin: ${origin}`)
    );
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],

  exposedHeaders: [
    "Authorization",
    "X-Total-Count",
  ],

  credentials: true,

  maxAge: 86400, // 24 hours
};

module.exports = cors(corsOptions);
