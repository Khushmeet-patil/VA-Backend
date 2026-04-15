const express = require("express")
const { getAllOrders } = require("../../controllers/order.controller")
const router = express.Router()

router.get("/", getAllOrders)

module.exports = router