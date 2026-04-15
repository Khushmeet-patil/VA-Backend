const express = require("express");
const router = express.Router();
const advertisementController = require("../../controllers/advertisement.controller");

/* ================= ADMIN ================= */
router.get("/", advertisementController.getAllAdvertisements);
router.post("/", advertisementController.createAdvertisement);
router.put("/:id", advertisementController.updateAdvertisement);
router.delete("/:id", advertisementController.deleteAdvertisement);

/* ================= PUBLIC (Optional) ================= */
// router.get("/active", advertisementController.getActiveAdvertisements);

module.exports = router;
