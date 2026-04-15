const express = require("express");
const router = express.Router();
const searchController = require("../../controllers/search.controller");

router.get("/", searchController.searchProducts);
router.get("/suggestions", searchController.searchSuggestions);

module.exports = router;
