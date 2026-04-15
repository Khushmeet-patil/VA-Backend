const express = require("express");
const router = express.Router();
const ratingController = require("../../controllers/rating.controller")

router.get("/product/:productId", ratingController.getProductRatings);

router.get("/breakdown/:productId", ratingController.getRatingBreakdown);

module.exports = router;
