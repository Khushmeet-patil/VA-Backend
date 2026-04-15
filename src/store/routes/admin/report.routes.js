const express = require("express");
const router = express.Router();
const { getAdminReports, updateReportStatus } = require("../../controllers/admin.report.controller");

router.get("/", getAdminReports);
router.put("/:id/status", updateReportStatus);

module.exports = router;
