const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const ChangeRequest = require("../models/ChangeRequest");
const activityService = require("./activity.service");
const logger = require("../utils/logger");

exports.applyCoupon = async ({ code, userId, cartTotal }) => {
  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    "approval.status": "approved",
  });

  if (!coupon) throw new Error("Invalid coupon");

  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validTill) {
    throw new Error("Coupon expired");
  }

  if (cartTotal < coupon.minOrderAmount) {
    throw new Error(`Minimum order amount ₹${coupon.minOrderAmount} required`);
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new Error("Coupon usage limit exceeded");
  }

  const usage = await CouponUsage.findOne({
    couponId: coupon._id,
    userId,
  });

  if (usage && usage.usedCount >= coupon.perUserLimit) {
    throw new Error("Coupon already used");
  }

  let discount = 0;

  if (coupon.discountType === "percentage") {
    discount = (cartTotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else {
    discount = coupon.discountValue;
  }

  return {
    couponId: coupon._id,
    discount,
    finalAmount: cartTotal - discount,
  };
};

exports.createCoupon = async (data) => {
  const existing = await Coupon.findOne({ code: data.code });
  if (existing) throw new Error("Coupon code already exists");

  // Default approval status for new coupons
  data.approval = { status: "pending" };

  const coupon = await Coupon.create(data);

  // Log activity
  await activityService.logActivity({
    type: "COUPON_CREATE",
    title: "Coupon Created",
    description: `Coupon "${coupon.code}" has been created and is pending approval.`,
    role: "vendor", // or "admin" if created by admin
    vendorId: data.createdBy, // assuming createdBy is vendorId here, check controller
    metadata: { couponId: coupon._id },
  });

  return coupon;
};

exports.getCoupons = async (query = {}) => {
  const coupons = await Coupon.find(query).sort({ createdAt: -1 });
  return coupons;
};

exports.getActiveCouponsForUser = async (userId) => {
  const now = new Date();

  // 1️⃣ User ke used coupons
  const usedCoupons = await CouponUsage.find({ userId })
    .select("couponId")
    .lean();

  const usedCouponIds = usedCoupons.map((c) => c.couponId);

  // 2️⃣ Active + Not used by this user
  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validTill: { $gte: now },
    _id: { $nin: usedCouponIds }, // 🔥 IMPORTANT
    $expr: {
      $lt: ["$usedCount", "$usageLimit"],
    },
  }).sort({ createdAt: -1 });

  return coupons;
};



/* ================= GET COUPON BY ID ================= */
exports.getCouponById = async (id) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new Error("Coupon not found");
  return coupon;
};

/* ================= UPDATE COUPON ================= */
exports.updateCoupon = async (id, data, user = null) => {
  const currentCoupon = await Coupon.findById(id);
  if (!currentCoupon) throw new Error("Coupon not found");

  // 🛡️ CHANGE REQUEST LOGIC
  if (user && user.role === "vendor" && currentCoupon.approval.status === "approved") {
    const changeRequest = await ChangeRequest.create({
      type: "coupon",
      documentId: id,
      typeModel: "Coupon",
      vendorId: user.vendorId || user._id, 
      oldData: currentCoupon.toObject(),
      newData: { ...currentCoupon.toObject(), ...data },
      status: "pending",
    });

    await activityService.logActivity({
      type: "COUPON_CHANGE_REQUEST",
      title: "Coupon Edit Requested",
      description: `Vendor has requested changes for approved coupon "${currentCoupon.code}".`,
      role: "vendor",
      userId: user._id,
      vendorId: user.vendorId,
      metadata: { couponId: id, changeRequestId: changeRequest._id },
    });

    return { 
      _id: id, 
      message: "Change request submitted for admin approval", 
      isChangeRequest: true,
      changeRequestId: changeRequest._id 
    };
  }

  const coupon = await Coupon.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!coupon) throw new Error("Coupon not found");
  return coupon;
};

/* ================= DELETE COUPON ================= */
exports.deleteCoupon = async (id) => {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw new Error("Coupon not found");
  return coupon;
};

exports.validateAndApplyCoupon = async ({
  couponCode,
  customerId,
  subtotal,
}) => {
  if (!couponCode) return { discount: 0, coupon: null };

  const now = new Date();

  const coupon = await Coupon.findOne({
    code: couponCode,
    isActive: true,
    "approval.status": "approved",
    validFrom: { $lte: now },
    validTill: { $gte: now },
  });

  if (!coupon) throw new Error("Invalid or expired coupon");

  if (subtotal < coupon.minOrderAmount) {
    throw new Error(
      `Minimum order amount is ₹${coupon.minOrderAmount}`
    );
  }

  // 🔒 per user limit (recommended)
  const userUsage = await CouponUsage.countDocuments({
    couponId: coupon._id,
    userId: customerId,
  });

  if (userUsage >= coupon.perUserLimit) {
    throw new Error("Coupon usage limit reached");
  }

  let discount = 0;

  if (coupon.discountType === "percentage") {
    discount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else {
    discount = coupon.discountValue;
  }

  return { discount, coupon };
};

