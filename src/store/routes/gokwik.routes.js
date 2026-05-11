/**
 * GoKwik Checkout Integration Routes
 *
 * These endpoints are called SERVER-TO-SERVER by GoKwik, not by the mobile app.
 * authMethod is "none" per merchant config, so no JWT middleware is applied.
 * cart_id (MongoDB Cart._id) is the shared session identifier.
 *
 * Base URL configured in GoKwik dashboard: https://api.vedicastro.co.in/store/api/gokwik
 */
const express = require("express");
const router = express.Router();
const controller = require("../controllers/gokwik.controller");

// Validate GoKwik webhook credentials (sent by GoKwik on webhook calls)
const verifyGokwikWebhook = (req, res, next) => {
  const appId = process.env.GK_APP_ID;
  const appSecret = process.env.GK_APP_SECRET;

  // Skip verification if credentials not configured yet
  if (!appId || !appSecret) return next();

  const sentId = req.headers["gk-app-id"];
  const sentSecret = req.headers["gk-app-secret"];

  if (sentId !== appId || sentSecret !== appSecret) {
    return res.status(401).json({ status_code: 401, error: "Unauthorized" });
  }
  next();
};

router.post("/get-cart", controller.getCart);
router.post("/set-shipping-address", controller.setShippingAddress);
router.post("/place-order", controller.placeOrder);
router.post("/check-order-exists", controller.checkOrderExists);
router.post("/remove-out-of-stock-items", controller.removeOutOfStockItems);
router.post("/order-update", verifyGokwikWebhook, controller.orderUpdate);
router.post("/abandoned-cart", verifyGokwikWebhook, controller.handleAbandonedCart);

module.exports = router;
