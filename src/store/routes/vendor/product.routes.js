const express = require("express");
const router = express.Router();
const productController = require("../../controllers/product.controller");

router.post(
  "/create",
  productController.createProduct
);

// Update own product
router.put(
  "/update/:id",
  productController.updateProduct
);

// Delete own product
router.delete(
  "/delete/:id",
  productController.deleteProduct
);

router.get(
  "/my-products",
  productController.getMyProducts
);

module.exports = router;