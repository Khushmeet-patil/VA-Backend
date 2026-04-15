const router = require("express").Router();
const wishlistController = require("../../controllers/wishlist.controller")

router.post("/", wishlistController.addToWishlist);
router.post("/toggle", wishlistController.toggleWishlist);
router.get("/", wishlistController.getWishlist);
router.delete("/:productId", wishlistController.removeFromWishlist);

module.exports = router;
