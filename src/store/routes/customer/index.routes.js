const express = require("express")
const router = express.Router()
const auth = require("../../middleware/auth.middleware");
const role = require("../../middleware/role.middleware");

router.use(auth);
router.use(role(["customer", "admin", "vendor"]));

router.use("/address", require("../customer/address.routes"))
router.use("/cart", require("../customer/cart.routes"))
router.use("/order", require("../customer/order.routes"))
router.use("/invoice", require("../customer/invoice.routes"))
router.use("/webhook", require("../customer/webhook.routes"))
router.use("/rating", require("../customer/rating.routes"))
router.use("/wishlist", require("../customer/wishlist.routes"))
router.use("/coupon", require("../customer/coupon.routes"))
router.use("/checkout", require("../customer/checkout.routes"))
router.use("/profile", require("../customer/profile.routes"))
router.use("/support", require("../customer/support.routes"))

module.exports = router