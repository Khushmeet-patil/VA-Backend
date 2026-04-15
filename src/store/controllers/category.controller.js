const categoryService = require("../services/category.service");
const logger = require("../utils/logger"); // adjust path if needed

/* ================= CREATE ================= */
exports.createCategory = async (req, res) => {
  try {
    logger.info("Create category request received", {
      body: req.body,
    });

    const category = await categoryService.createCategory(req.body);

    logger.info("Category created successfully", {
      categoryId: category._id,
      name: category.name,
    });

    return res.status(201).json({
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    logger.error("Failed to create category", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      message: "Category creation failed",
      error: error.message,
    });
  }
};

/* ================= GET ALL ================= */
exports.getCategories = async (req, res) => {
  try {
    logger.info("Fetching categories list");

    const categories = await categoryService.getAllCategories();

    return res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      count: categories.length,
      categories,
    });
  } catch (error) {
    logger.error("Failed to fetch categories", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};

/* ================= GET BY ID ================= */
exports.getCategory = async (req, res) => {
  try {
    logger.info("Fetching category by id", {
      categoryId: req.params.id,
    });

    const category = await categoryService.getCategoryById(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      category,
    });
  } catch (error) {
    logger.error("Category not found", {
      categoryId: req.params.id,
      message: error.message,
    });

    return res.status(404).json({
      success: false,
      message: "Category not found",
      error: error.message,
    });
  }
};

/* ================= UPDATE ================= */
exports.updateCategory = async (req, res) => {
  try {
    logger.info("Updating category", {
      categoryId: req.params.id,
      updates: req.body,
    });

    const category = await categoryService.updateCategory(
      req.params.id,
      req.body
    );

    logger.info("Category updated successfully", {
      categoryId: category._id,
    });

    return res.status(200).json({
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    logger.error("Failed to update category", {
      categoryId: req.params.id,
      message: error.message,
      stack: error.stack,
    });

    return res.status(404).json({
      message: "Category update failed",
      error: error.message,
    });
  }
};

/* ================= DELETE ================= */
exports.deleteCategory = async (req, res) => {
  try {
    logger.info("Deleting category", {
      categoryId: req.params.id,
    });

    await categoryService.deleteCategory(req.params.id);

    logger.info("Category deleted successfully", {
      categoryId: req.params.id,
    });

    return res.status(200).json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete category", {
      categoryId: req.params.id,
      message: error.message,
      stack: error.stack,
    });

    return res.status(404).json({
      message: "Category deletion failed",
      error: error.message,
    });
  }
};
