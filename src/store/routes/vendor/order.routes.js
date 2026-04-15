const express = require("express")
const { vendorOrders, updateItemStatus, vendorConfirmOrder } = require("../../controllers/order.controller")
const router = express.Router()

router.get("/", vendorOrders)
router.put("/update/:id", updateItemStatus)
router.patch(
  "/:id/confirm",
  vendorConfirmOrder
);

module.exports = router