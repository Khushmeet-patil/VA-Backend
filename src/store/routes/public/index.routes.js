const express = require("express");
const { getAllBanners } = require("../../controllers/banner.controller");
const { getActiveAdvertisements } = require("../../controllers/advertisement.controller");
const router = express.Router();

router.use("/vendor", require("./../vendor/profile.routes"));
router.use("/product", require("./../product.routes"));
router.use("/product-purposes", require("./meta.routes"))
router.use("/rating", require("./rating.routes"))
router.use("/banner", getAllBanners)
router.get("/advertisements/active", getActiveAdvertisements)
router.use("/search", require("./search.routes"))
router.use("/categories", require("./categories.routes"))
router.use("/site-settings", require("./site-settings.routes"))
router.use("/live-temples", require("./liveTemple.routes"))

module.exports = router;