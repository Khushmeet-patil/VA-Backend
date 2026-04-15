const express = require("express");
const {
  getActiveLiveTemples,
  getLiveTempleById,
} = require("../../controllers/liveTemple.controller");
const router = express.Router();

router.get("/", getActiveLiveTemples);
router.get("/:id", getLiveTempleById);

module.exports = router;
