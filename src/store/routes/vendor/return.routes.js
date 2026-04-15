const express = require("express");
const router = express.Router();
const { getVendorReturns, updateReturnStatus } = require("../../controllers/vendor.return.controller");

router.get("/", getVendorReturns);
router.put("/:id/status", updateReturnStatus);

module.exports = router;
