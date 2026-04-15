const express = require("express");
const router = express.Router();

const { fetchMyProfile, updateMyProfile } = require("../../controllers/customer.controller");

router.get("/", fetchMyProfile);
router.put("/update", updateMyProfile);

module.exports = router;
