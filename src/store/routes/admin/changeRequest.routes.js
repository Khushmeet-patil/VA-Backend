const express = require("express");
const router = express.Router();
const changeRequestController = require("../../controllers/changeRequest.controller");

router.get("/pending", changeRequestController.getPendingRequests);
router.get("/:id", changeRequestController.getRequestById);
router.post("/approve/:id", changeRequestController.approveRequest);
router.post("/reject/:id", changeRequestController.rejectRequest);

module.exports = router;
