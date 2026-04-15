const productService = require("../services/product.service");
const logger = require("../utils/logger");

/* ================= CREATE PRODUCT (VENDOR) ================= */
exports.createProduct = async (req, res) => {
  try {

    const product = await productService.createProduct({
      productData: req.body,
      userId: req.user._id,
      vendorId: req.user.vendorId,
    });

    return res.status(201).json({
      success: true,
      message: "Product submitted for admin approval",
      product,
    });
  } catch (error) {
    logger.error("Create product controller error", {
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const user = req.user;
    const {
      categoryId,
      vendorId,
      featured,
      approvalStatus,
      purposes,
      search,
      minPrice,
      maxPrice,
      minRating,
      sort
    } = req.query;

    const filters = {};

    /* ================= PRICE & RATINGS & SORT ================= */
    if (minPrice !== undefined) filters.minPrice = minPrice;
    if (maxPrice !== undefined) filters.maxPrice = maxPrice;
    if (minRating !== undefined) filters.minRating = minRating;
    if (sort) filters.sort = sort;

    /* ================= SEARCH ================= */
    if (search) {
      filters.search = search;
    }

    /* ================= CATEGORY ================= */
    if (categoryId) {
      filters.category = categoryId; // ✅ FIX
    }

    /* ================= FEATURED ================= */
    if (featured !== undefined) {
      filters.featured = featured === "true"; // ✅ FIX
    }

    /* ================= APPROVAL STATUS ================= */
    if (approvalStatus) {
      filters.approvalStatus = approvalStatus; // ✅ FIX
    }

    if (purposes) {
      filters.purposes = purposes
    }

    /* ================= ROLE BASED ================= */

    // Vendor → only own products
    if (user?.role === "vendor") {
      filters.vendorId = user.id;
    }

    // Admin → optional vendor filter
    if (user?.role === "admin" && vendorId) {
      filters.vendorId = vendorId;
    }

    // Public / Customer → only approved + visible
    if (!user || user.role === "customer") {
      filters.approvalStatus = "approved";
      filters.isVisible = true;
    }

    const products = await productService.getProducts(filters);

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    logger.error("Get products controller error", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};


/* ================= GET PRODUCT BY ID ================= */
exports.getProduct = async (req, res) => {
  try {
    const product = await productService.getProductById(req.params.id);

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    logger.warn("Get product failed", {
      productId: req.params.id,
      error: error.message,
    });

    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE PRODUCT (VENDOR / ADMIN) ================= */
exports.updateProduct = async (req, res) => {
  try {
    const product = await productService.updateProduct(
      req.params.id,
      req.body,
      req.user
    );

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    logger.error("Update product controller error", {
      productId: req.params.id,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= DELETE PRODUCT ================= */
exports.deleteProduct = async (req, res) => {
  try {
    await productService.deleteProduct(req.params.id, req.user);

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product controller error", {
      productId: req.params.id,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADMIN APPROVE PRODUCT ================= */
exports.approveProduct = async (req, res) => {
  try {
    const product = await productService.approveProduct(
      req.params.id,
      req.user._id,
      req.user.role
    );

    return res.status(200).json({
      success: true,
      message: "Product approved successfully",
      product,
    });
  } catch (error) {
    logger.error("Approve product controller error", {
      productId: req.params.id,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADMIN REJECT PRODUCT ================= */
exports.rejectProduct = async (req, res) => {
  try {
    const { reason } = req.body;

    const product = await productService.rejectProduct(
      req.params.id,
      reason,
      req.user._id,
      req.user.role
    );

    return res.status(200).json({
      success: true,
      message: "Product rejected successfully",
      product,
    });
  } catch (error) {
    logger.error("Reject product controller error", {
      productId: req.params.id,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyProducts = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;

    const result = await productService.myProduct(vendorId, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      search: req.query.search,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};
