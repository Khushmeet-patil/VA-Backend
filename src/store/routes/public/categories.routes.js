const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/category.controller");

router.get("/", categoryController.getCategories);
router.get("/:id", categoryController.getCategory);

module.exports = router;
