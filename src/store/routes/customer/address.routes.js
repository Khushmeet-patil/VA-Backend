const express = require("express");
const router = express.Router();

const {
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  getAddressById,
} = require("../../controllers/address.controller");

router.post("/create-address", createAddress);
router.get("/", getAddresses);
router.get("/fetch-single/:id", getAddressById);
router.put("/:id/update", updateAddress);
router.delete("/:id/delete", deleteAddress);

module.exports = router;
