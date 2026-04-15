const express = require("express");
const router = express.Router();
const customerSupportController = require("../../controllers/customer.support.controller");
const protect = require("../../middleware/auth.middleware");

router.post("/return", protect, customerSupportController.submitReturnRequest);
router.post("/report", protect, customerSupportController.submitReportIssue);
router.get("/return/:orderId", protect, customerSupportController.getReturnByOrder);

module.exports = router;
