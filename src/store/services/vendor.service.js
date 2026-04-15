const Vendor = require("../models/Vendor");
const logger = require("../utils/logger");
const activityService = require("./activity.service");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { getMonthRanges } = require("../utils/dateRanges");
const sendEmail = require("../utils/email/sendEmail");
const vendorApprovedTemplate = require("../utils/email/templates/vendorApprovedTemplate");
const vendorRejectedTemplate = require("../utils/email/templates/vendorRejectedTemplate");
const vendorRegistrationReceivedTemplate = require("../utils/email/templates/vendorRegistrationReceivedTemplate");
const EMAIL_SUBJECTS = require("../constants/emailSubjects");
const User = require("../models/User");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const vendorReverifyRequiredTemplate = require("../utils/email/templates/vendorReverifyTemplate");
const { getAdminEmails } = require("./admin.service");
const vendorReverifyRejectedTemplate = require("../utils/email/templates/vendorReverifyRejectedTemplate");
const vendorReverifyApprovedTemplate = require("../utils/email/templates/vendorReverifyApprovedTemplate");

/* ================= CREATE / APPLY ================= */
exports.createVendor = async (data) => {
  try {
    const existing = await Vendor.findOne({
      storeEmail: data.storeEmail,
    });

    if (existing) {
      logger.warn("Vendor application already exists", {
        storeEmail: data.storeEmail,
      });
      throw new Error("Vendor application already exists");
    }

    const vendor = await Vendor.create({
      ...data,
      status: "pending",
      verificationStage: "application",
      userId: null,
    });

    await activityService.logActivity({
      type: "vendor_apply",
      title: "New Vendor Registration",
      description: `${vendor.storeName} has applied as a vendor`,
      role: "admin",
      vendorId: vendor._id,
      metadata: {
        storeEmail: vendor.storeEmail,
        businessType: vendor.businessType,
      },
    });

    await sendEmail({
      to: vendor.storeEmail,
      subject: EMAIL_SUBJECTS.VENDOR_REGISTER,
      html: vendorRegistrationReceivedTemplate({
        vendorName: vendor.storeName,
        platformName: "VedicStore | VedicAstro",
        supportEmail: "support@vedicastro.co.in",
        year: new Date().getFullYear(),
      }),
    });

    logger.info("Vendor application submitted", {
      vendorId: vendor._id,
      storeEmail: vendor.storeEmail,
    });

    return vendor;
  } catch (error) {
    logger.error("Vendor apply failed", {
      error: error.message,
    });
    throw error;
  }
};

/* ================= GET ALL (ADMIN) ================= */
exports.getVendors = async (status, search) => {
  try {
    /* ================= MATCH STAGE ================= */
    const matchStage = {};
    if (status) matchStage.status = status;

    /* ================= SEARCH CONDITION ================= */
    const searchMatch = search
      ? {
          $or: [
            { storeName: { $regex: search, $options: "i" } },
            { storeEmail: { $regex: search, $options: "i" } },
            { businessName: { $regex: search, $options: "i" } },
            { storePhone: { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
          ],
        }
      : null;

    const vendors = await Vendor.aggregate([
      /* ================= FILTER BY STATUS ================= */
      { $match: matchStage },

      /* ================= USER ================= */
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ================= SEARCH ================= */
      ...(searchMatch ? [{ $match: searchMatch }] : []),

      /* ================= WALLET ================= */
      {
        $lookup: {
          from: "vendorwallets",
          localField: "_id",
          foreignField: "vendorId",
          as: "wallet",
        },
      },
      {
        $unwind: {
          path: "$wallet",
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ================= PRODUCTS ================= */
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "vendorId",
          as: "products",
        },
      },

      /* ================= ORDERS (ITEM LEVEL) ================= */
      {
        $lookup: {
          from: "orders",
          let: { vendorId: "$_id" },
          pipeline: [
            { $unwind: "$items" },
            {
              $match: {
                $expr: {
                  $eq: ["$items.vendorId", "$$vendorId"],
                },
              },
            },
          ],
          as: "orderItems",
        },
      },

      /* ================= CALCULATIONS ================= */
      {
        $addFields: {
          totalProducts: { $size: "$products" },

          totalOrders: {
            $size: {
              $setUnion: [
                {
                  $map: {
                    input: "$orderItems",
                    as: "oi",
                    in: "$$oi._id",
                  },
                },
                [],
              ],
            },
          },

          totalSales: {
            $sum: "$orderItems.items.totalPrice",
          },

          walletBalance: { $ifNull: ["$wallet.balance", 0] },
          totalEarned: { $ifNull: ["$wallet.totalEarned", 0] },
          totalWithdrawn: { $ifNull: ["$wallet.totalWithdrawn", 0] },

          /* 🔑 PASSWORD STATUS */
          passwordStatus: {
            $cond: [
              { $ifNull: ["$user.setPasswordToken", false] },
              "PENDING",
              "SET",
            ],
          },
        },
      },

      /* ================= CLEAN RESPONSE ================= */
      {
        $project: {
          products: 0,
          orderItems: 0,
          wallet: 0,

          "user.password": 0,
          "user.setPasswordToken": 0,
          "user.setPasswordExpire": 0,
          "user.resetPasswordToken": 0,
          "user.resetPasswordExpire": 0,
        },
      },

      /* ================= SORT ================= */
      { $sort: { createdAt: -1 } },
    ]);

    return vendors;
  } catch (error) {
    logger.error("Fetch vendors failed", {
      status,
      search,
      error: error.message,
    });
    throw error;
  }
};


/* ================= GET BY ID ================= */
exports.getVendorById = async (id) => {
  try {
    const vendor = await Vendor.findById(id)
      .populate({
        path: "userId",
        select: "email role setPasswordToken",
      })
      .lean();

    if (!vendor) {
      logger.warn("Vendor not found", { vendorId: id });
      throw new Error("Vendor not found");
    }

    /* ================= PASSWORD STATUS (DERIVED) ================= */
    const passwordStatus = vendor.userId?.setPasswordToken ? "PENDING" : "SET";

    /* ================= CLEAN RESPONSE ================= */
    return {
      ...vendor,

      // 🔑 expose only derived status
      passwordStatus,

      // ❌ make sure sensitive data never leaks
      userId: vendor.userId
        ? {
            _id: vendor.userId._id,
            email: vendor.userId.email,
            role: vendor.userId.role,
          }
        : null,
    };
  } catch (error) {
    logger.error("Fetch vendor by ID failed", {
      vendorId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= APPROVE ================= */
exports.approveVendor = async (id, notes, commission) => {
  try {
    // 🔍 FIND VENDOR
    const vendor = await Vendor.findById(id);

    if (!vendor) {
      logger.warn("Vendor approval failed - not found", { vendorId: id });
      throw new Error("Vendor not found");
    }

    if (!vendor.storeEmail || !vendor.storePhone) {
      logger.error("CRITICAL: Vendor contact info missing", { 
        vendorId: id,
        email: vendor.storeEmail,
        phone: vendor.storePhone 
      });
      throw new Error(`Vendor contact info missing (Email: ${vendor.storeEmail ? 'OK' : 'MISSING'}, Phone: ${vendor.storePhone ? 'OK' : 'MISSING'}). Cannot approve.`);
    }

    // 🛑 ALREADY APPROVED SAFETY
    if (vendor.status === "approved" && vendor.userId) {
      logger.info("Vendor already approved", {
        vendorId: vendor._id,
        userId: vendor.userId,
      });
      return vendor;
    }

    // 🔍 FIND OR CREATE USER
    // Searching by BOTH email and mobile as both are unique in the DB
    let user = await User.findOne({
      $or: [
        { email: vendor.storeEmail },
        { mobile: vendor.storePhone }
      ]
    });
    
    // 🔑 ALWAYS generate/refresh set-password token on approval for the first time
    const rawToken = crypto.randomBytes(32).toString("hex");
    var hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    if (!user) {
      // Dummy password (login blocked until set-password)
      const dummyPassword = await bcrypt.hash(
        crypto.randomBytes(16).toString("hex"),
        10,
      );

      user = await User.create({
        email: vendor.storeEmail,
        mobile: vendor.storePhone,
        password: dummyPassword,
        firstName: vendor.storeName,
        role: "vendor",
        setPasswordToken: hashedToken,
        setPasswordExpire: Date.now() + 30 * 60 * 1000,
      });
    } else {
      // User already exists (e.g. was a customer/main app user), upgrade to vendor
      user.role = "vendor";
      
      // 🏗️ HARMONIZE: Ensure mandatory store fields exist
      if (!user.firstName) user.firstName = vendor.storeName;
      if (!user.mobile) user.mobile = vendor.storePhone;
      
      // 🔑 CRITICAL: Main app users don't have passwords. 
      if (!user.password) {
        user.password = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
      }

      // 📧 EMAIL: If user has no email or a placeholder, try to set it to storeEmail
      if (!user.email || user.email.includes("@vedicastro.int")) {
        // Only set it if nobody else is using it
        const emailUsed = await User.findOne({ email: vendor.storeEmail });
        if (!emailUsed) {
          user.email = vendor.storeEmail;
        } else {
          logger.warn("Vendor approval info: storeEmail already in use, skipping email update for existing user", { 
            existingUserId: user._id, 
            email: vendor.storeEmail 
          });
        }
      }

      user.setPasswordToken = hashedToken;
      user.setPasswordExpire = Date.now() + 30 * 60 * 1000;
      await user.save();
    }

    // 🔗 Set-password URL (RAW token only)
    var setPasswordUrl = `${process.env.STORE_FRONTEND_URL}/set-password?token=${rawToken}`;


    // 🛡️ DATA INTEGRITY (In case vendor was created via old code or direct DB injection)
    // This prevents Mongoose validation errors if required fields were somehow missing.
    if (!vendor.businessType) vendor.businessType = "individual";
    if (!vendor.businessName) vendor.businessName = vendor.storeName;
    if (!vendor.businessDescription) vendor.businessDescription = vendor.storeDescription || "Vendor";
    if (!vendor.taxId) vendor.taxId = "NA";
    if (!vendor.bankAccountName) vendor.bankAccountName = vendor.storeName;
    if (!vendor.bankAccountNumber) vendor.bankAccountNumber = "NA";
    if (!vendor.bankIFSCCode) vendor.bankIFSCCode = "NA";
    if (!vendor.bankName) vendor.bankName = "NA";
    if (!vendor.accountType) vendor.accountType = "savings";
    if (!vendor.businessLicense) vendor.businessLicense = "NA";
    if (!vendor.businessLicenseNumber) vendor.businessLicenseNumber = "NA";
    if (!vendor.businessLicenseExpiry) vendor.businessLicenseExpiry = new Date();

    vendor.status = "approved";
    vendor.approvalNotes = notes || "";
    vendor.rejectionReason = "";
    
    // Ensure commission is a number
    const finalCommission = Number(commission);
    vendor.commissionRate = (!isNaN(finalCommission) && commission !== undefined && commission !== null) 
      ? finalCommission 
      : 12;

    vendor.userId = user._id;

    await vendor.save();

    /* ================= ACTIVITY LOG ================= */

    await activityService.logActivity({
      type: "vendor_approve",
      title: "New Vendor Approved",
      description: `${vendor.storeName} has been approved as a vendor`,
      role: "admin",
      vendorId: vendor._id,
      metadata: {
        storeEmail: vendor.storeEmail,
        businessType: vendor.businessType,
      },
    });

    /* ================= EMAIL ================= */

    try {
      await sendEmail({
        to: vendor.storeEmail,
        subject: user.setPasswordToken ? EMAIL_SUBJECTS.SET_PASSWORD : "Vendor Account Approved",
        html: vendorApprovedTemplate({
          vendorName: vendor.storeName,
          vendorEmail: vendor.storeEmail,
          loginUrl: setPasswordUrl,
          commission: vendor.commissionRate,
          platformName: "VedicStore | VedicAstro",
          supportEmail: "support@vedicastro.co.in",
          year: new Date().getFullYear(),
        }),
      });
    } catch (emailError) {
      logger.error("Vendor approval email failed", {
        vendorId: vendor._id,
        email: vendor.storeEmail,
        error: emailError.message,
      });
      // We don't throw here to avoid failing the whole approval if just email fails
      // However, the user might want to know. For now, let's just log it.
    }

    logger.info("Vendor approved successfully", {
      vendorId: vendor._id,
      userId: user._id,
    });

    return vendor;
  } catch (error) {
    logger.error("CRITICAL: Vendor approval failed", {
      vendorId: id,
      errorMessage: error.message,
      errorStack: error.stack,
      validationErrors: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : null
    });
    throw error;
  }
};

/* ================= REJECT ================= */
exports.rejectVendor = async (id, reason) => {
  try {
    if (!reason) {
      logger.warn("Vendor rejection failed - no reason", { vendorId: id });
      throw new Error("Rejection reason is required");
    }

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      {
        status: "rejected",
        rejectionReason: reason,
        approvalNotes: "",
      },
      { new: true },
    );

    if (!vendor) {
      logger.warn("Vendor rejection failed - not found", { vendorId: id });
      throw new Error("Vendor not found");
    }

    await sendEmail({
      to: vendor.storeEmail,
      subject: EMAIL_SUBJECTS.VENDOR_REJECTED,
      html: vendorRejectedTemplate({
        vendorName: vendor.storeName,
        reason,
        platformName: "VedicStore | VedicAstro",
        supportEmail: "support@vedicastro.co.in",
        year: new Date().getFullYear(),
      }),
    });

    await activityService.logActivity({
      type: "vendor_reject",
      title: "New Vendor Rejected",
      description: `${vendor.storeName} has been rejected as a vendor. Reason: ${reason}`,
      role: "admin",
      vendorId: vendor._id,
      metadata: {
        storeEmail: vendor.storeEmail,
        businessType: vendor.businessType,
      },
    });

    logger.info("Vendor rejected", {
      vendorId: id,
      userId: vendor.userId,
      reason,
    });

    return vendor;
  } catch (error) {
    logger.error("Vendor rejection error", {
      vendorId: id,
      error: error.message,
    });
    throw error;
  }
};

exports.getVendorDashboardStats = async (vendorId) => {
  const { startOfCurrentMonth, startOfPreviousMonth, endOfPreviousMonth } =
    getMonthRanges();

  const currentOrders = await Order.countDocuments({
    vendorId,
    createdAt: { $gte: startOfCurrentMonth },
  });

  const previousOrders = await Order.countDocuments({
    vendorId,
    createdAt: {
      $gte: startOfPreviousMonth,
      $lte: endOfPreviousMonth,
    },
  });

  const currentRevenueAgg = await Order.aggregate([
    {
      $match: {
        vendorId,
        createdAt: { $gte: startOfCurrentMonth },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const previousRevenueAgg = await Order.aggregate([
    {
      $match: {
        vendorId,
        createdAt: {
          $gte: startOfPreviousMonth,
          $lte: endOfPreviousMonth,
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const currentRevenue = currentRevenueAgg[0]?.total || 0;
  const previousRevenue = previousRevenueAgg[0]?.total || 0;

  return {
    orders: {
      total: currentOrders,
      change: calcChange(currentOrders, previousOrders),
    },
    revenue: {
      total: currentRevenue,
      change: calcChange(currentRevenue, previousRevenue),
    },
  };
};

exports.getVendorProfile = async (vendorId) => {
  try {
    const vendor = await Vendor.findById(vendorId)
      .populate("userId", "email role setPasswordToken")
      .lean();

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    /* ================= PASSWORD STATUS (DERIVED) ================= */
    const passwordStatus = vendor.userId?.setPasswordToken ? "PENDING" : "SET";

    /* ================= STATS ================= */

    // 1️⃣ Total Products
    const totalProducts = await Product.countDocuments({ vendorId });

    // 2️⃣ Total Orders
    const orderAgg = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.vendorId": vendor._id,
        },
      },
      {
        $group: {
          _id: null,
          orderIds: { $addToSet: "$_id" },
          totalSales: { $sum: "$items.totalPrice" },
        },
      },
      {
        $project: {
          totalOrders: { $size: "$orderIds" },
          totalSales: 1,
        },
      },
    ]);

    const stats = orderAgg[0] || {
      totalOrders: 0,
      totalSales: 0,
    };

    return {
      ...vendor,

      // 🔑 ADD THIS
      passwordStatus,

      totalProducts,
      totalOrders: stats.totalOrders,
      totalSales: stats.totalSales,
      revenue: stats.totalSales,
    };
  } catch (error) {
    throw error;
  }
};

const setNestedValue = (obj, path, value) => {
  const keys = path.split(".");
  let current = obj;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
    } else {
      current[key] = current[key] || {};
      current = current[key];
    }
  });
};

exports.updateVendorProfile = async (vendorId, data) => {
  try {
    const nonSensitiveFields = [
      // Store
      "storeName",
      "storeDescription",
      "storePhone",
      "storeWebsite",

      // Business
      "businessDescription",
      "businessCategory",
      "businessSubcategory",

      // Address
      "businessAddress.street",
      "businessAddress.city",
      "businessAddress.state",
      "businessAddress.postalCode",
      "businessAddress.country",
    ];

    const sensitiveFields = [
      // Compliance
      "gstNumber",
      "pan",
      "taxId",

      // Bank
      "bankAccountName",
      "bankAccountNumber",
      "bankIFSCCode",
      "bankName",
      "accountType",

      // Documents
      "documentsUploaded.businessLicense",
      "documentsUploaded.idProof",
      "documentsUploaded.addressProof",
      "documentsUploaded.cancelledCheque",
    ];

    const updateData = {};
    const pendingUpdates = {};
    let requiresReapproval = false;

    /* ================= NON-SENSITIVE → MAIN ================= */
    for (const field of nonSensitiveFields) {
      const value = field.split(".").reduce((o, k) => o?.[k], data);
      if (value !== undefined) {
        setNestedValue(updateData, field, value);
      }
    }

    /* ================= SENSITIVE → PENDING ================= */
    for (const field of sensitiveFields) {
      const value = field.split(".").reduce((o, k) => o?.[k], data);
      if (value !== undefined) {
        setNestedValue(pendingUpdates, field, value);
        requiresReapproval = true;
      }
    }

    /* ================= IF SENSITIVE UPDATED ================= */
    if (requiresReapproval) {
      pendingUpdates.updatedAt = new Date();
      updateData.pendingUpdates = pendingUpdates;

      // 🔑 IMPORTANT CHANGE
      updateData.verificationStage = "reverification";
      updateData.approvalNotes = "";
      updateData.rejectionReason = "";
    }

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: updateData },
      { new: true },
    ).populate("userId", "email role");

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    /* ================= ADMIN EMAIL ================= */
    if (requiresReapproval) {
      const adminEmails = await getAdminEmails();

      if (adminEmails.length) {
        await sendEmail({
          to: adminEmails,
          subject: EMAIL_SUBJECTS.VENDOR_REVERIFY_REQUIRED,
          html: vendorReverifyRequiredTemplate({
            vendorName: vendor.storeName,
            vendorEmail: vendor.storeEmail,
            platformName: "VedicStore | VedicAstro",
            adminPanelUrl: `${process.env.ADMIN_URL}/vendors/reverify`,
            year: new Date().getFullYear(),
          }),
        });
      }
    }

    /* ================= ACTIVITY ================= */
    await activityService.logActivity({
      type: "vendor_profile_update",
      title: requiresReapproval
        ? "Vendor Profile Updated (Re-verification Required)"
        : "Vendor Profile Updated",
      description: `${vendor.storeName} updated profile details`,
      role: "vendor",
      vendorId: vendor._id,
    });

    return {
      vendor,
      requiresReapproval,
    };
  } catch (error) {
    throw error;
  }
};

exports.approveVendorReverify = async (vendorId, adminId) => {
  const vendor = await Vendor.findById(vendorId);

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  // ✅ Correct check
  if (vendor.verificationStage !== "reverification") {
    throw new Error("Vendor is not pending re-verification");
  }

  /* ================= APPLY PENDING UPDATES ================= */
  const { pendingUpdates } = vendor;

  if (pendingUpdates) {
    // Compliance
    if (pendingUpdates.gstNumber !== undefined)
      vendor.gstNumber = pendingUpdates.gstNumber;

    if (pendingUpdates.pan !== undefined) vendor.pan = pendingUpdates.pan;

    if (pendingUpdates.taxId !== undefined) vendor.taxId = pendingUpdates.taxId;

    // Bank
    if (pendingUpdates.bankAccountName !== undefined)
      vendor.bankAccountName = pendingUpdates.bankAccountName;

    if (pendingUpdates.bankAccountNumber !== undefined)
      vendor.bankAccountNumber = pendingUpdates.bankAccountNumber;

    if (pendingUpdates.bankIFSCCode !== undefined)
      vendor.bankIFSCCode = pendingUpdates.bankIFSCCode;

    if (pendingUpdates.bankName !== undefined)
      vendor.bankName = pendingUpdates.bankName;

    if (pendingUpdates.accountType !== undefined)
      vendor.accountType = pendingUpdates.accountType;

    // Documents
    if (pendingUpdates.documentsUploaded) {
      vendor.documentsUploaded = {
        ...vendor.documentsUploaded,
        ...pendingUpdates.documentsUploaded,
      };
    }
  }

  /* ================= CLEAR RE-VERIFY STATE ================= */
  vendor.pendingUpdates = undefined;
  vendor.verificationStage = null;
  vendor.approvalNotes = "Profile re-verified and approved";
  vendor.rejectionReason = "";

  await vendor.save();

  /* ================= ACTIVITY LOG ================= */
  await activityService.logActivity({
    type: "vendor_reverify_approved",
    title: "Vendor Re-Verification Approved",
    description: `${vendor.storeName} profile re-verified`,
    role: "admin",
    vendorId: vendor._id,
    metadata: {
      approvedBy: adminId,
    },
  });

  /* ================= EMAIL ================= */
  await sendEmail({
    to: vendor.storeEmail,
    subject: EMAIL_SUBJECTS.VENDOR_REVERIFY_APPROVED,
    html: vendorReverifyApprovedTemplate({
      vendorName: vendor.storeName,
      platformName: "VedicStore | VedicAstro",
      supportEmail: "support@vedicastro.co.in",
      year: new Date().getFullYear(),
    }),
  });

  return vendor;
};

exports.rejectVendorReverify = async (vendorId, reason, adminId) => {
  if (!reason) {
    throw new Error("Rejection reason is required");
  }

  const vendor = await Vendor.findById(vendorId);

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  // ✅ Correct check
  if (vendor.verificationStage !== "reverification") {
    throw new Error("Vendor is not pending re-verification");
  }

  /* ================= DISCARD PENDING UPDATES ================= */
  vendor.pendingUpdates = undefined;
  vendor.verificationStage = null;
  vendor.rejectionReason = reason;
  vendor.approvalNotes = "";

  await vendor.save();

  /* ================= ACTIVITY LOG ================= */
  await activityService.logActivity({
    type: "vendor_reverify_rejected",
    title: "Vendor Re-Verification Rejected",
    description: `${vendor.storeName} re-verification rejected`,
    role: "admin",
    vendorId: vendor._id,
    metadata: {
      reason,
      rejectedBy: adminId,
    },
  });

  /* ================= EMAIL ================= */
  await sendEmail({
    to: vendor.storeEmail,
    subject: EMAIL_SUBJECTS.VENDOR_REVERIFY_REJECTED,
    html: vendorReverifyRejectedTemplate({
      vendorName: vendor.storeName,
      reason,
      platformName: "VedicStore | VedicAstro",
      supportEmail: "support@vedicastro.co.in",
      year: new Date().getFullYear(),
    }),
  });

  return vendor;
};

exports.updateVendorStatus = async ({
  vendorId,
  status,
  adminId,
  reason = "",
}) => {
  const vendor = await Vendor.findById(vendorId);

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  const allowedStatuses = ["approved", "suspended"];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid status update");
  }

  /* ================= UPDATE STATUS ================= */
  vendor.status = status;

  if (status === "suspended") {
    vendor.rejectionReason = reason || "Vendor suspended by admin";
  } else {
    vendor.rejectionReason = "";
  }

  vendor.approvalNotes =
    status === "approved"
      ? "Vendor activated by admin"
      : "Vendor suspended by admin";

  await vendor.save();

  /* ================= ACTIVITY LOG ================= */
  await activityService.logActivity({
    type: status === "approved" ? "vendor_activated" : "vendor_suspended",
    title: status === "approved" ? "Vendor Activated" : "Vendor Suspended",
    description: `${vendor.storeName} marked as ${status}`,
    role: "admin",
    vendorId: vendor._id,
    metadata: {
      updatedBy: adminId,
      reason,
    },
  });

  return vendor;
};

exports.adminResendVendorSetPassword = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId);

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  if (!vendor.storeEmail) {
    throw new Error("Vendor email not found");
  }

  // 🔁 Reuse existing email-based service
  return await exports.resendSetPasswordLink(vendor.storeEmail);
};
