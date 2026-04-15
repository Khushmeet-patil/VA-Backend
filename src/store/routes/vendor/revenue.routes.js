const express = require("express");
const router = express.Router();
const {
  getVendorRevenue,
} = require("../../controllers/revenue.controller");

router.get(
  "/",
  getVendorRevenue
);

module.exports = router;
