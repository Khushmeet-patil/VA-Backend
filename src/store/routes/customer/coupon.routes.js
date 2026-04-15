const express = require("express");
const router = express.Router();
const couponController = require("../../controllers/coupon.controller");

router.post("/apply", couponController.applyCoupon);

router.get("/", couponController.getActiveCoupons);

module.exports = router;
