const express = require("express");
const router = express.Router();
const { getRecentActivity } = require("../controllers/activity.controller");
const auth = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

router.get("/recent", auth, roleMiddleware("admin"), getRecentActivity);

module.exports = router;
