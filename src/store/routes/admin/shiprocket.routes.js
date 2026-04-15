const express = require("express");
const {
  addShiprocketAccount,
  updateShiprocketAccount,
  getActiveShiprocketAccount,
} = require("../../controllers/shiprocket.controller");

const router = express.Router();

router.post("/", addShiprocketAccount);

router.put("/:id/update", updateShiprocketAccount);

router.get("/ship", getActiveShiprocketAccount);

module.exports = router;
