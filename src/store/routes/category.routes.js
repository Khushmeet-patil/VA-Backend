const express = require("express");
const router = express.Router();

const categoryController = require("../controllers/category.controller");
const auth = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

// Get all categories (public)
router.get("/", categoryController.getCategories);

// Get category by id (public)
router.get("/:id", categoryController.getCategory);

// Create category
router.post(
  "/",
  auth,
  authorize(["admin"]),
  categoryController.createCategory
);

// Update category
router.put(
  "/:id",
  auth,
  authorize(["admin"]),
  categoryController.updateCategory
);

// Delete category
router.delete(
  "/:id",
  auth,
  authorize(["admin"]),
  categoryController.deleteCategory
);

module.exports = router;
