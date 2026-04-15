const addressService = require("../services/address.service");

/* ================= CREATE ADDRESS ================= */
exports.createAddress = async (req, res) => {
  try {
    const address = await addressService.createAddress(
      req.user._id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET ALL ADDRESSES ================= */
exports.getAddresses = async (req, res) => {
  try {
    const { type } = req.query;

    const addresses = await addressService.getUserAddresses(
      req.user._id,
      { type }
    );

    return res.status(200).json({
      success: true,
      addresses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET SINGLE ADDRESS ================= */
exports.getAddressById = async (req, res) => {
  try {
    const address = await addressService.getAddressById(
      req.user._id,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      address,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE ADDRESS ================= */
exports.updateAddress = async (req, res) => {
  try {
    const address = await addressService.updateAddress(
      req.user._id,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= SET DEFAULT ADDRESS ================= */
exports.setDefaultAddress = async (req, res) => {
  try {
    const address = await addressService.setDefaultAddress(
      req.user.id,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Default address updated",
      address,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= DELETE ADDRESS ================= */
exports.deleteAddress = async (req, res) => {
  try {
    await addressService.deleteAddress(
      req.user._id,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Address removed successfully",
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};
