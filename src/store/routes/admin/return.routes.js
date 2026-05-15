const express = require("express");
const router = express.Router();
const { getAdminReturns, updateReturnStatus } = require("../../controllers/admin.return.controller");

router.get("/", getAdminReturns);
router.patch("/:id/status", updateReturnStatus);

module.exports = router;
