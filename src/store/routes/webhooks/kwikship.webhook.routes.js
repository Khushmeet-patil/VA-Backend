const express = require("express");
const KwikshipService = require("../../services/kwikship.service");

const router = express.Router();

/* =========================
   KWIKSHIP STATUS WEBHOOK
   POST /store/api/webhooks/kwikship
========================= */
router.post("/", async (req, res) => {
  try {
    const result = await KwikshipService.handleWebhook(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("[Kwikship Webhook] Error:", err.message);
    return res.status(200).json({ success: false, message: err.message });
  }
});

module.exports = router;
