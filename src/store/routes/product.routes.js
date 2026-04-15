const express = require("express");
const router = express.Router();

const productController = require("../controllers/product.controller");
const auth = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

/* =====================================================
   PUBLIC ROUTES (NO AUTH)
===================================================== */

// Get all approved & active products
router.get("/", productController.getProducts);

// Get product by ID
router.get("/:id", productController.getProduct);

module.exports = router;
