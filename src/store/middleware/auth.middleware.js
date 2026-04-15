/**
 * Store Auth Middleware (Hybrid)
 *
 * This middleware bridges VedicAstro and VedicStore authentication.
 * It tries to resolve the user from two sources:
 * 1. VedicAstro Primary DB (Default connection) - for mobile OTP users.
 * 2. VedicStore Atlas DB (Store connection) - for Admins and Vendors.
 */
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const AtlasUser = require("../models/User"); // Points to Atlas DB
const Vendor = require("../models/Vendor");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    // JWT_SECRET is shared between both apps
    const secret = process.env.JWT_SECRET || process.env.STORE_JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    const userId = decoded._id || decoded.id;

    let user = null;
    let source = "";

    // 🔍 STEP 1: Try Primary VedicAstro DB (Default Mongoose Connection)
    try {
      // Access the User model registered on the default connection
      const MainUser = mongoose.model("User");
      user = await MainUser.findById(userId).select(
        "_id mobile email name role isBlocked"
      );
      if (user) source = "primary";
    } catch (e) {
      // Ignore errors if model not registered yet or search fails
    }

    // 🔍 STEP 2: Fallback to Store Atlas DB (Store Mongoose Connection)
    if (!user) {
      try {
        user = await AtlasUser.findById(userId);
        if (user) source = "atlas";
      } catch (e) {
        // Ignore search errors
      }
    }

    // 🔴 NOT FOUND
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    // 🔄 SYNC: If user is from Primary DB, ensure they have a record in Store Atlas DB
    // This supports Store-specific features like Wishlist, Cart, and Order relationships.
    if (source === "primary") {
      try {
        const existsInAtlas = await AtlasUser.findById(userId);
        if (!existsInAtlas) {
          const nameParts = (user.name || "").trim().split(" ");
          await AtlasUser.create({
            _id: user._id, // Keep the same ID
            firstName: nameParts[0] || "User",
            lastName: nameParts.slice(1).join(" ") || "",
            email: user.email || `${user.mobile}@vedicastro.int`, // Placeholder for unique requirement
            password: "OTP_USER_" + Math.random().toString(36).slice(-8), // Dummy password for OTP users
            mobile: user.mobile,
            role: "customer",
          });
          console.log(`[Store Auth] Synced primary user ${user.mobile} to Store DB`);
        }
      } catch (syncError) {
        console.error("[Store Auth] Shadow user sync failed:", syncError.message);
        // We continue anyway, as the user is authenticated via Primary DB
      }
    }

    // 🔴 BLOCKED
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "Account is blocked" });
    }

    // 🔹 Map fields to the standard shape expected by store controllers
    if (source === "primary") {
      const nameParts = (user.name || "").trim().split(" ");
      
      // 🔑 CRITICAL FIX: To avoid 403 Forbidden, check Atlas for specific roles like 'vendor'
      let finalRole = user.role === "admin" ? "admin" : "customer";
      let vendorId = decoded.vendorId || null;

      try {
        const atlasUser = await AtlasUser.findById(userId);
        if (atlasUser && (atlasUser.role === "vendor" || atlasUser.role === "admin")) {
          finalRole = atlasUser.role;

          // If vendorId missing in token but role is vendor, find it in DB
          if (finalRole === "vendor" && !vendorId) {
            const vendorDoc = await Vendor.findOne({ userId: atlasUser._id });
            if (vendorDoc) vendorId = vendorDoc._id;
          }
        }
      } catch (e) { /* ignore lookup errors */ }

      req.user = {
        _id: user._id,
        email: user.email || null,
        firstName: nameParts[0] || "User",
        lastName: nameParts.slice(1).join(" ") || "",
        phone: user.mobile,
        role: finalRole, // Uses prioritized 'vendor' or 'admin' role
        vendorId: vendorId,
        dbSource: "primary",
      };
    } else {
      let vendorId = decoded.vendorId || (user.role === "vendor" ? user.vendorId : null);
      
      // Lookup vendorId if it's not in the user doc or token
      if (user.role === "vendor" && !vendorId) {
        try {
          const vendorDoc = await Vendor.findOne({ userId: user._id });
          if (vendorDoc) vendorId = vendorDoc._id;
        } catch (e) { /* ignore */ }
      }

      req.user = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.mobile,
        role: user.role, // 'admin', 'vendor', or 'customer'
        vendorId: vendorId,
        dbSource: "atlas",
      };
    }


    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
