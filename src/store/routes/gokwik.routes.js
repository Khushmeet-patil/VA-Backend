/**
 * GoKwik Checkout Integration Routes
 *
 * These endpoints are called SERVER-TO-SERVER by GoKwik, not by the mobile app.
 * authMethod is "none" per merchant config, so no JWT middleware is applied.
 * cart_id (MongoDB Cart._id) is the shared session identifier.
 *
 * Base URL configured in GoKwik dashboard: https://www.vedicastro.co.in/store/api/gokwik
 */
const express = require("express");
const router = express.Router();
const controller = require("../controllers/gokwik.controller");

router.post("/get-cart", controller.getCart);
router.post("/set-shipping-address", controller.setShippingAddress);
router.post("/place-order", controller.placeOrder);
router.post("/check-order-exists", controller.checkOrderExists);
router.post("/remove-out-of-stock-items", controller.removeOutOfStockItems);
router.post("/order-update", controller.orderUpdate);

module.exports = router;
