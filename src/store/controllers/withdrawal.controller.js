const withdrawalService = require("../services/withdrawal.service");

/* ======================================================
   FETCH WITHDRAWAL REQUEST
====================================================== */
exports.fetchAllWithdrawals = async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;

    const result = await withdrawalService.getAllWithdrawals({
      page: Number(page),
      limit: Number(limit),
      status,
      search,
    });

    res.status(200).json({
      success: true,
      message: "Withdrawals fetched successfully",
      ...result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   VENDOR FETCH OWN WITHDRAWALS
====================================================== */
exports.getVendorWithdrawals = async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor access denied. Please re-login to update your session.",
      });
    }

    const { page, limit, status } = req.query;

    const result = await withdrawalService.getVendorWithdrawals({
      vendorId,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status,
    });

    res.status(200).json({
      success: true,
      message: "History fetched successfully",
      ...result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   VENDOR FETCH WALLET
====================================================== */
exports.getVendorWallet = async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor access denied. Please re-login.",
      });
    }
    const wallet = await withdrawalService.getVendorWallet(vendorId);

    res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   VENDOR CREATE REQUEST
====================================================== */
exports.requestWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { amount } = req.body;

    const withdrawal = await withdrawalService.requestWithdrawal({
      vendorId,
      amount,
    });

    res.json({
      success: true,
      message: "Withdrawal request submitted",
      withdrawal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   ADMIN APPROVE / REJECT
====================================================== */
exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const { status, adminRemark, approvedAmount } = req.body;
    
    const result = await withdrawalService.updateWithdrawalStatus({
      withdrawalId,
      status,
      adminRemark,
      approvedAmount: approvedAmount ? Number(approvedAmount) : null,
    });

    res.json({
      success: true,
      message: `Withdrawal ${status}`,
      withdrawal: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   ADMIN MARK AS PAID
====================================================== */
exports.markWithdrawalPaid = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const { paymentProof } = req.body;

    const result = await withdrawalService.markAsPaid({
      withdrawalId,
      paymentProof,
    });

    res.json({
      success: true,
      message: "Payment marked as successful",
      withdrawal: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   ADMIN GET WITHDRAWAL BREAKDOWN
====================================================== */
exports.getWithdrawalBreakdown = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const breakdown = await withdrawalService.getWithdrawalBreakdown(withdrawalId);

    res.json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
