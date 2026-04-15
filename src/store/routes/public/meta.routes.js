const express = require("express");
const router = express.Router();
const { getProductPurposes, getPurposeForPublic } = require("../../controllers/meta.controller");

router.get("/", getProductPurposes);
router.get("/purpose", getPurposeForPublic)

module.exports = router;
