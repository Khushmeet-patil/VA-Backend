const express = require("express");
const router = express.Router();

const ratingController = require("../../controllers/rating.controller");

router.post(
  "/",
  ratingController.addRating
);

router.get(
  "/can-review/:productId",
  ratingController.checkReviewEligibility
);

module.exports = router;
