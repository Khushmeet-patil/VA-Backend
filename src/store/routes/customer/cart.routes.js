const express = require("express");
const router = express.Router();
const cartController = require("../../controllers/cart.controller");

router.get("/", cartController.getCart);
router.post("/add", cartController.addToCart);
router.put("/update", cartController.updateQuantity);
router.delete("/remove/:productId", cartController.removeItem);
router.delete("/clear", cartController.clearCart);

module.exports = router;
