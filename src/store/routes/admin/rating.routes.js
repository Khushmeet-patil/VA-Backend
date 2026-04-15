const express = require("express");
const router = express.Router();

const ratingController = require("../../controllers/rating.controller");

router.post(
  "/manual",
  ratingController.addManualRating
);

router.get(
  "/",
  ratingController.getAllRatingsForAdmin
);

router.delete(
  "/:ratingId",
  ratingController.deleteRatingByAdmin
);

module.exports = router;
