const express = require("express");
const router = express.Router();
const controller = require("../../controllers/order.controller");
const kwikshipController = require("../../controllers/kwikship.controller");
const auth = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

/* ================= CUSTOMER ================= */
router.post("/create", auth, controller.createOrder);
router.post("/initiate-payment", auth, controller.initiatePayment);
router.post("/place-prepaid", auth, controller.placePrepaidOrder);
router.post("/place-cod", auth, controller.placeCodOrder);
router.post("/place-advance-cod", auth, controller.placeAdvanceCodOrder);
// Legacy Razorpay verify (kept for back-compat)
router.post("/verify-payment", auth, controller.verifyPaymentAndCreateOrder);
router.get("/my", controller.myOrders);
router.get("/:orderId/tracking", auth, kwikshipController.getCustomerOrderTracking);
router.get("/:id", controller.getSingleOrderController);

/* ================= VENDOR ================= */
router.get("/vendor", auth, authorize("vendor"), controller.vendorOrders);
router.patch(
  "/vendor/:orderId/items/:itemId/status",
  auth,
  authorize("vendor"),
  controller.updateItemStatus
);

module.exports = router;
