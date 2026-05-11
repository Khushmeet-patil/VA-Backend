const express = require("express");
const router = express.Router();
const gokwikController = require("../../controllers/gokwik.controller");

// This is mounted under /store/api/admin/gokwik
// Full path: POST /store/api/admin/gokwik/sync-all
router.post("/sync-all", gokwikController.syncEverything);

module.exports = router;
