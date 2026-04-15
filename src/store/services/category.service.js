const Category = require("../models/Category");
const logger = require("../utils/logger");

/* ================= CREATE ================= */
exports.createCategory = async ({ name, image }) => {
  try {
    if (!name || !image) {
      logger.warn("Category creation failed - missing fields", { name });
      throw new Error("Name and image are required");
    }

    const exists = await Category.findOne({ name });
    if (exists) {
      logger.warn("Category creation failed - already exists", { name });
      throw new Error("Category already exists");
    }

    const category = await Category.create({ name, image });

    logger.info("Category created", {
      categoryId: category._id,
      name: category.name,
    });

    return category;
  } catch (error) {
    logger.error("Create category error", {
      name,
      error: error.message,
    });
    throw error;
  }
};

/* ================= GET ALL ================= */
exports.getAllCategories = async () => {
  try {
    return await Category.find().sort({ createdAt: -1 });
  } catch (error) {
    logger.error("Fetch categories failed", {
      error: error.message,
    });
    throw error;
  }
};

/* ================= GET BY ID ================= */
exports.getCategoryById = async (id) => {
  try {
    const category = await Category.findById(id);
    if (!category) {
      logger.warn("Category not found", { categoryId: id });
      throw new Error("Category not found");
    }
    return category;
  } catch (error) {
    logger.error("Fetch category by ID failed", {
      categoryId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= UPDATE ================= */
exports.updateCategory = async (id, data) => {
  try {
    const category = await Category.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    if (!category) {
      logger.warn("Category update failed - not found", { categoryId: id });
      throw new Error("Category not found");
    }

    logger.info("Category updated", {
      categoryId: id,
      updatedFields: Object.keys(data),
    });

    return category;
  } catch (error) {
    logger.error("Update category failed", {
      categoryId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= DELETE ================= */
exports.deleteCategory = async (id) => {
  try {
    const category = await Category.findByIdAndDelete(id);

    if (!category) {
      logger.warn("Category delete failed - not found", { categoryId: id });
      throw new Error("Category not found");
    }

    logger.info("Category deleted", {
      categoryId: id,
      name: category.name,
    });

    return category;
  } catch (error) {
    logger.error("Delete category failed", {
      categoryId: id,
      error: error.message,
    });
    throw error;
  }
};
