const express = require("express");
const router = express.Router();
const { getAdminDashboard } = require("../../controllers/admin.controller");
const { getRecentActivity } = require("../../controllers/activity.controller");

router.get("/", getAdminDashboard);

router.get("/recent", getRecentActivity);

module.exports = router;
