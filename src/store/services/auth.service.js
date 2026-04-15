const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const { generateToken } = require("../utils/jwt");
const logger = require("../utils/logger");
const sendEmail = require("../utils/email/sendEmail");
const crypto = require("crypto");
const activityService = require("./activity.service");
const resetPasswordTemplate = require("../utils/email/templates/resetPasswordTemplate");
const EMAIL_SUBJECTS = require("../constants/emailSubjects");
const resendResetPasswordTemplate = require("../utils/email/templates/resendResetPasswordTemplate");

/* ================= REGISTER ================= */
exports.registerUser = async (data) => {
  const { email, password, firstName, lastName } = data;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt with existing email", { email });
      throw new Error("Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: "customer",
    });

    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  } catch (error) {
    throw error;
  }
};

/* ================= LOGIN ================= */
exports.loginUser = async ({ email, password }) => {
  // 🔍 FIND USER (password explicitly selected)
  const user = await User.findOne({ email }).select("+password");

  console.log(`[AuthService] Login attempt: ${email} | Found: ${!!user} | Model DB: ${User.db.name}`);

  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  // ❌ PASSWORD INVALID
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return { success: false, reason: "INVALID_PASSWORD" };
  }

  let vendorId = null;

  // 🛑 VENDOR-SPECIFIC CHECKS
  if (user.role === "vendor") {
    // ❌ PASSWORD NOT SET YET
    if (user.setPasswordToken) {
      return {
        success: false,
        reason: "PASSWORD_NOT_SET",
      };
    }

    const vendorProfile = await Vendor.findOne({ userId: user._id });

    if (!vendorProfile) {
      return {
        success: false,
        reason: "VENDOR_PROFILE_NOT_FOUND",
      };
    }

    if (vendorProfile.status !== "approved") {
      return {
        success: false,
        reason: "VENDOR_NOT_APPROVED",
      };
    }

    vendorId = vendorProfile._id;
  }

  // 🔐 GENERATE TOKEN
  const token = generateToken({
    id: user._id,
    role: user.role,
    vendorId,
  });

  return {
    success: true,
    token,
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      vendorId,
    },
  };
};

exports.forgotPasswordService = async (email) => {
  let user = await User.findOne({ email });

  if (!user) {
    // 🔍 Check if it's a pending vendor (who won't have a User record yet)
    const pendingVendor = await Vendor.findOne({ storeEmail: email, status: "pending" });
    if (pendingVendor) {
      throw new Error("Your application is not approved yet.");
    }

    throw new Error("Register first");
  }

  // 🛑 VENDOR-SPECIFIC CHECKS (for users who ALREADY have a User record)
  if (user.role === "vendor") {
    const vendorProfile = await Vendor.findOne({ userId: user._id });

    if (!vendorProfile) {
      throw new Error("Register first");
    }

    if (vendorProfile.status === "pending") {
      throw new Error("Your application is not approved yet.");
    }

    if (vendorProfile.status === "rejected") {
      throw new Error("Your application has been rejected. Please contact support for more information.");
    }

    if (vendorProfile.status === "suspended") {
      throw new Error("Your account has been suspended. Please contact support.");
    }
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  // 🔒 Hash token before saving
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.STORE_FRONTEND_URL}/forget-password?token=${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: EMAIL_SUBJECTS.RESET_PASSWORD,
    html: resetPasswordTemplate({
      userName: user.firstName || "User",
      resetUrl,
      platformName: "VedicStore | VedicAstro",
      supportEmail: "support@vedicastro.co.in",
      expiryMinutes: 15,
      year: new Date().getFullYear(),
    }),
  });

  return {
    success: true,
    message: "Reset password email sent",
  };
};

exports.resetPasswordService = async (token, newPassword) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select("+password");

  if (!user) {
    return {
      success: false,
      message: "Invalid or expired reset token",
    };
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  await activityService.logActivity({
    type: "PASSWORD_RESET",
    title: "Password Reset Successful",
    userId: user._id,
    metadata: {
      email: user.email,
    },
  });

  return {
    success: true,
    message: "Password reset successfully",
  };
};

exports.resendSetPasswordLink = async (email) => {
  try {
    const user = await User.findOne({ email });

    // 🔒 Silent response (prevents email enumeration)
    if (!user || user.role !== "vendor") {
      return {
        success: true,
        message: "If the account exists, an email has been sent",
      };
    }

    // 🛑 Password already set OR token already consumed
    if (!user.setPasswordToken || !user.setPasswordExpire) {
      return {
        success: true,
        message: "If the account exists, an email has been sent",
      };
    }

    // 🔑 Generate RAW token (send in email)
    const rawToken = crypto.randomBytes(32).toString("hex");

    // 🔒 Hash token (store in DB)
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // ♻️ Overwrite old token
    user.setPasswordToken = hashedToken;
    user.setPasswordExpire = Date.now() + 30 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // 🔗 Set-password URL (RAW token only)
    const setPasswordUrl = `${process.env.STORE_FRONTEND_URL}/set-password?token=${rawToken}`;

    // 📧 Send email
    await sendEmail({
      to: user.email,
      subject: EMAIL_SUBJECTS.RESEND_SET_PASSWORD,
      html: resendResetPasswordTemplate({
        userName: user.firstName || "Vendor",
        resetUrl: setPasswordUrl,
        expiryMinutes: 30,
        year: new Date().getFullYear(),
      }),
    });

    logger.info("Resend set-password link sent", {
      userId: user._id,
      email: user.email,
    });

    return {
      success: true,
      message: "Set password link sent successfully",
    };
  } catch (error) {
    logger.error("Resend set-password service failed", {
      email,
      error: error.message,
    });
    throw error;
  }
};

exports.setPasswordService = async (token, newPassword) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    setPasswordToken: hashedToken,
    setPasswordExpire: { $gt: Date.now() },
  }).select("+password");

  if (!user) {
    return {
      success: false,
      message: "Invalid or expired set-password link",
    };
  }

  // ✅ Set password
  user.password = await bcrypt.hash(newPassword, 10);
  user.setPasswordToken = undefined;
  user.setPasswordExpire = undefined;

  await user.save();

  await activityService.logActivity({
    type: "SET_PASSWORD",
    title: "Vendor Set Password",
    userId: user._id,
    metadata: { email: user.email },
  });

  return {
    success: true,
    message: "Password set successfully. You can now login.",
  };
};

