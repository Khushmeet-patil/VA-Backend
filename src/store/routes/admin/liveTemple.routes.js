const express = require("express");
const {
  getAllLiveTemples,
  getLiveTempleById,
  updateLiveTemple,
  updateLiveTempleStatus,
  deleteLiveTemple,
  createLiveTemple,
} = require("../../controllers/liveTemple.controller");
const router = express.Router();

router.post("/create-temple", createLiveTemple);
router.get("/", getAllLiveTemples);
router.get("/:id", getLiveTempleById);
router.put("/:id/update", updateLiveTemple);
router.patch("/:id/status", updateLiveTempleStatus);
router.delete("/:id/delete", deleteLiveTemple);

module.exports = router;
