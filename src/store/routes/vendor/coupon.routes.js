const express = require("express")
const { createCoupon, getCoupons, getCouponById, updateCoupon, deleteCoupon } = require("../../controllers/coupon.controller")
const router = express.Router()

router.post("/create", createCoupon)

router.get("/", getCoupons)

router.get("/:id", getCouponById)

router.put("/:id/update", updateCoupon)

router.delete("/:id/delete", deleteCoupon)

module.exports = router