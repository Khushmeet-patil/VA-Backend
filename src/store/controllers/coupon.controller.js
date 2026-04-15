const couponService = require("../services/coupon.service");

exports.applyCoupon = async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    const userId = req.user.id;

    if (!code || !cartTotal) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and cart total are required",
      });
    }

    const parsedCartTotal = Number(cartTotal);
    if (isNaN(parsedCartTotal) || parsedCartTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart total",
      });
    }

    const result = await couponService.applyCoupon({
      code,
      userId,
      cartTotal: parsedCartTotal,
    });

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const coupon = await couponService.createCoupon({
      ...req.body,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

/* ================= GET ALL ================= */
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await couponService.getCoupons();

    res.json({
      success: true,
      data: coupons,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getActiveCoupons = async (req, res) => {
  try {
    const userId = req.user._id
    const coupon = await couponService.getActiveCouponsForUser(userId);

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

/* ================= GET BY ID ================= */
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);

    res.json({
      success: true,
      data: coupon,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
};

/* ================= UPDATE ================= */
exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await couponService.updateCoupon(
      req.params.id,
      req.body,
      req.user
    );

    res.json({
      success: true,
      message: "Coupon updated successfully",
      data: coupon,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

/* ================= DELETE ================= */
exports.deleteCoupon = async (req, res) => {
  try {
    await couponService.deleteCoupon(req.params.id);

    res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
};
