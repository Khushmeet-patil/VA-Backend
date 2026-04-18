/**
 * VedicStore Express Sub-App
 *
 * This is mounted at `/store` by the unified BACKEND-INT index.ts.
 * CORS is handled by the parent app, so it's removed here.
 * All store routes become: /store/api/...
 */
const express = require("express");

const authRoutes = require("./routes/auth.routes");
const categoryRoutes = require("./routes/category.routes");
const vendorRoutes = require("./routes/vendor/index.routes");
const activityRoutes = require("./routes/activity.routes");
const adminRoutes = require("./routes/admin/index.routes");
const publicRoutes = require("./routes/public/index.routes");
const customerRoutes = require("./routes/customer/index.routes");
const uploadRoutes = require("./routes/upload.routes");
const kwikshipWebhookRoutes = require("./routes/webhooks/kwikship.webhook.routes");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔹 Serve uploaded store images
app.use("/api/uploads", express.static("uploads"));

// 🔹 Request Logger
app.use((req, res, next) => {
  console.log(`[STORE] [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 🔹 Store APIs
app.use("/api/upload", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/webhooks/kwikship", kwikshipWebhookRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "VedicStore Sub-App running" });
});

module.exports = app;
