const authService = require("../services/auth.service");
const logger = require("../utils/logger"); // adjust path if needed

/* ================= REGISTER ================= */
exports.register = async (req, res) => {
  try {
    logger.info("User registration request received", {
      email: req.body.email,
    });

    const user = await authService.registerUser(req.body);

    logger.info("User registered successfully", {
      userId: user.id,
      email: user.email,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user,
    });
  } catch (error) {
    logger.error("User registration failed", {
      email: req.body.email,
      message: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
};

/* ================= LOGIN ================= */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await authService.loginUser({ email, password });

    // 🔴 USER NOT FOUND
    if (!result.success && result.reason === "USER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 🔴 INVALID PASSWORD
    if (!result.success && result.reason === "INVALID_PASSWORD") {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // 🔴 PASSWORD NOT SET (VENDOR FIRST LOGIN)
    if (!result.success && result.reason === "PASSWORD_NOT_SET") {
      return res.status(403).json({
        success: false,
        message: "Please set your password using the link sent to your email",
      });
    }

    // 🔴 VENDOR NOT APPROVED
    if (!result.success && result.reason === "VENDOR_NOT_APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Your vendor account is not approved yet",
      });
    }

    // 🔴 VENDOR PROFILE MISSING
    if (!result.success && result.reason === "VENDOR_PROFILE_NOT_FOUND") {
      return res.status(403).json({
        success: false,
        message: "Vendor profile not found. Please contact support.",
      });
    }

    // ❌ FALLBACK (future-proof)
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Login failed",
      });
    }

    // ✅ SUCCESS
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    logger.error("Login system error", {
      email,
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};


exports.me = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await authService.forgotPasswordService(email);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Error sending reset email",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    const result = await authService.resetPasswordService(token, password);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Reset password error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

exports.logout = async (req, res) => {
  try {
    res.clearCookie("auth_token", {
      httpOnly: true,
    });

    res.clearCookie("refresh_token", {
      httpOnly: true,
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

exports.resendSetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await authService.resendSetPasswordLink(email);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("Resend set password failed", {
      email,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to resend set password link",
    });
  }
};

exports.setPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and password are required",
      });
    }

    const result = await authService.setPasswordService(token, password);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
