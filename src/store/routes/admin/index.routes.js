const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const role = require("../../middleware/role.middleware");

// 🔐 Global protection for ALL admin routes
router.use(auth);
router.use(role("admin"));

// Sub routes
router.use("/dashboard", require("./dashboard.routes"));
router.use("/vendors", require("./vendors.routes"));
router.use("/categories", require("./categories.routes"));
router.use("/banner", require("./banner.routes"));
router.use("/advertisements", require("./advertisement.routes"));
router.use("/product", require("./product.routes"));
router.use("/change-request", require("./changeRequest.routes"));
router.use("/orders", require("./order.routes"));
router.use("/revenue", require("./revenue.routes"));
router.use("/rating", require("./ratings.routes"));
router.use("/withdrawal", require("./withdrawal.routes"));
router.use("/site-settings", require("./site-settings.routes"));
router.use("/shiprocket", require("./shiprocket.routes"));
router.use("/kwikship", require("./kwikship.routes"));
router.use("/reports", require("./report.routes"));
router.use("/webhooks/shiprocket", require("../webhooks/shiprocket.webhook.routes"));
router.use("/live-temples", require("./liveTemple.routes"));
router.use("/purposes", require("./purpose.routes"));
// router.use("/analytics", require("./analytics.routes"));
// router.use("/profile", require("./profile.routes"));

module.exports = router;
