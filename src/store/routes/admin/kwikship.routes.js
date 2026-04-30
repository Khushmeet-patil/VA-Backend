const express = require("express");
const {
  addKwikshipAccount,
  getActiveKwikshipAccount,
  getTrackingStatus,
  createShipment,
  createShipmentForVendor,
  cancelWaybill,
  retryRefund,
  retryReplacementForward,
} = require("../../controllers/kwikship.controller");

const router = express.Router();

router.post("/", addKwikshipAccount);
router.get("/account", getActiveKwikshipAccount);
router.get("/track/:waybill", getTrackingStatus);
router.post("/ship/:orderId", createShipment);
router.post("/ship/:orderId/vendor/:vendorId", createShipmentForVendor);
router.post("/cancel/:waybill", cancelWaybill);
router.post("/return/:returnId/refund", retryRefund);
router.post("/return/:returnId/replacement", retryReplacementForward);

module.exports = router;
