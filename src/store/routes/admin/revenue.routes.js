const express = require("express");
const { getAdminRevenue, getAdminYearComparison } = require("../../controllers/revenue.controller");
const router = express.Router();

router.get(
  "/",
  getAdminRevenue
);

module.exports = router;
