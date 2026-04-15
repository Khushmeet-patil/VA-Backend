const express = require("express");
const router = express.Router();

const bannerController = require("../../controllers/banner.controller");

/* ================= ADMIN ================= */
router.post(
  "/create",
  bannerController.createBanner
);

router.get(
  "/",
  bannerController.getAllBanners
);

router.put(
  "/update/:id",
  bannerController.updateBanner
);

router.delete(
  "/delete/:id",
  bannerController.deleteBanner
);

router.get(
  "/active",
  bannerController.getActiveBanners
);

module.exports = router;
