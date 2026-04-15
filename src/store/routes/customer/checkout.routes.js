const express = require("express")
const router = express.Router()
const checkoutController = require("../../controllers/checkout.controller");

router.post("/cart", checkoutController.cartCheckout);
router.post("/buy-now", checkoutController.buyNowCheckout);
router.post("/summary", checkoutController.getCheckoutSummary);


module.exports = router