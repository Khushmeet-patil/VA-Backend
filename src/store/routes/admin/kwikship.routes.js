const express = require("express");
const {
  addKwikshipAccount,
  getActiveKwikshipAccount,
  getTrackingStatus,
  createShipment
} = require("../../controllers/kwikship.controller");

const router = express.Router();

router.post("/", addKwikshipAccount);
router.get("/account", getActiveKwikshipAccount);
router.get("/track/:waybill", getTrackingStatus);
router.post("/ship/:orderId", createShipment);

module.exports = router;
