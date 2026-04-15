const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/category.controller");

router.get("/", categoryController.getCategories);
router.post("/create", categoryController.createCategory);
router.put("/update/:id", categoryController.updateCategory);
router.delete("/delete/:id", categoryController.deleteCategory);

module.exports = router;