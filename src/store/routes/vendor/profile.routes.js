const express = require("express");
const router = express.Router();

const vendorController = require("../../controllers/vendor.controller");

router.post("/apply", vendorController.createVendor);

router.get("/dashboard", vendorController.getVendorDashboard);

router.get("/my-profile/:id", vendorController.getVendorProfile);

router.put("/update/:id", vendorController.updateVendorProfile);

module.exports = router;