const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const role = require("../../middleware/role.middleware");

// 🔐 Global protection for ALL admin routes
router.use(auth);
router.use(role("vendor"));

// Sub routes
router.use("/dashboard", require("./dashboard.routes"));
router.use("/profile", require("./profile.routes"));
router.use("/products", require("./product.routes"));
router.use("/orders", require("./order.routes"));
router.use("/revenue", require("./revenue.routes"));
router.use("/withdrawal", require("./withdrawal.routes"));
router.use("/coupon", require("./coupon.routes"));
router.use("/returns", require("./return.routes"));
// router.use("/analytics", require("./analytics.routes"));

module.exports = router;
