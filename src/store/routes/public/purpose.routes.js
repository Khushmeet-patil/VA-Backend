const express = require("express");
const router = express.Router();
const Purpose = require("../../models/Purpose");

// Get all active purposes (Public)
router.get("/", async (req, res) => {
  try {
    const purposes = await Purpose.find({ isActive: true }).sort({ name: 1 });
    res.json(purposes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
