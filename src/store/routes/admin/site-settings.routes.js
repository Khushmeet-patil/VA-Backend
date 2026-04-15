const express = require("express");
const router = express.Router();

const siteSetting = require("../../controllers/site-settings.controller");

router.get("/", siteSetting.getWebsiteDetails);

router.post("/create-update", siteSetting.createOrUpdateWebsiteDetails)

module.exports = router;
