const mongoose = require("mongoose");
const User = require("../models/User");
const Address = require("../models/Address");
const Order = require("../models/Order");
const CouponUsage = require("../models/CouponUsage");

exports.fetchMyProfile = async (userId) => {
  try {
    /* ================= USER ================= */
    let user = await User.findById(userId).select(
      "-password -setPasswordToken -setPasswordExpire -resetPasswordToken -resetPasswordExpire -__v"
    );

    // 🔍 HYBRID: If not in Store DB, try Primary DB
    if (!user) {
      try {
        const MainUser = mongoose.model("User");
        const mainUser = await MainUser.findById(userId).select(
          "_id mobile email name role isBlocked profilePhoto"
        );

        if (mainUser) {
          user = {
            _id: mainUser._id,
            firstName: (mainUser.name || "").split(" ")[0] || "User",
            lastName: (mainUser.name || "").split(" ").slice(1).join(" ") || "",
            email: mainUser.email || "",
            phone: mainUser.mobile,
            role: mainUser.role === "admin" ? "admin" : "customer",
            profilePhoto: mainUser.profilePhoto || "",
            isHybrid: true,
          };
        }
      } catch (e) {
        console.error("[Store Service] Primary user fetch failed:", e.message);
      }
    }

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    /* ================= ADDRESSES ================= */
    const addresses = await Address.find({ userId })
      .sort({ isDefault: -1, createdAt: -1 }) // default first
      .select("-__v");

    /* ================= TOTAL ORDERS ================= */
    const totalOrders = await Order.countDocuments({
      customerId: userId,
      orderStatus: { $ne: "cancelled" }, // optional safety
    });

    /* ================= TOTAL WISHLIST ================= */
    const totalWishlist = user.wishlist ? user.wishlist.length : 0;

    /* ================= TOTAL COUPONS USED ================= */
    const totalCouponsUsed = await CouponUsage.countDocuments({
      userId,
    });

    return {
      success: true,
      user,
      addresses,
      stats: {
        totalOrders,
        totalWishlist,
        totalCouponsUsed,
      },
    };
  } catch (error) {
    console.error("Fetch profile error:", error);
    throw error;
  }
};



exports.updateMyProfile = async (userId, payload) => {
  try {
    const allowedFields = [
      "firstName",
      "lastName",
      "phone",
      "profileImage",
      "place",
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (payload[field] !== undefined) {
        updateData[field] = payload[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error("No valid fields to update");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      throw new Error("User not found");
    }

    return {
      success: true,
      message: "Profile updated successfully",
      user,
    };
  } catch (error) {
    throw error;
  }
};
