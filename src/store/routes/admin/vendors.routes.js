const express = require("express");
const router = express.Router();

const vendorController = require("../../controllers/vendor.controller");

router.get("/:id", vendorController.getVendor);

router.get("/", vendorController.getVendors);

router.post("/:id/approve", vendorController.approveVendor);

router.post("/:id/reject", vendorController.rejectVendor);

router.put("/:id/reverify/reject", vendorController.rejectVendorReverify)

router.put("/:id/reverify/approve", vendorController.approveVendorReverify)

router.patch("/:id/status", vendorController.updateStatus)

module.exports = router;
