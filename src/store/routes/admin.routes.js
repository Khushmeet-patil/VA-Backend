const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const role = require("../middleware/role.middleware");
const { getAdminDashboard } = require("../controllers/admin.controller");

router.get(
  "/dashboard",
  auth,
  role("admin"),
  getAdminDashboard
);

module.exports = router;