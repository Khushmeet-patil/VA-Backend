const express = require("express");
const router = express.Router();

const siteSetting = require("../../controllers/site-settings.controller");

router.get("/", siteSetting.getWebsiteDetails);

module.exports = router;
