const express = require("express");
const {
  shiprocketWebhook,
} = require("../../controllers/shiprocket.controller");

const router = express.Router();

/* =========================
   SHIPROCKET WEBHOOK
========================= */

router.post("/", shiprocketWebhook);

module.exports = router;
