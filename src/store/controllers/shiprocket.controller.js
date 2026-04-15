const ShiprocketService = require("../services/shiprocket.service.js");

/* =========================
   ADMIN: ADD / UPDATE ACCOUNT
========================= */

exports.addShiprocketAccount = async (req, res) => {
  try {
    const account = await ShiprocketService.storeAccount(req.body);

    res.status(201).json({
      success: true,
      message: "Shiprocket account added",
      data: account,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateShiprocketAccount = async (req, res) => {
  try {
    const account = await ShiprocketService.updateAccount(
      req.params.id,
      req.body
    );

    res.json({
      success: true,
      message: "Shiprocket account updated",
      data: account,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getActiveShiprocketAccount = async (req, res) => {
  try {
    const account = await ShiprocketService.getActiveAccount();
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

/* =========================
   INTERNAL: CREATE SHIPMENT
========================= */

exports.createShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await ShiprocketService.createFullShipment(orderId);

    res.json({
      success: true,
      message: "Shipment created successfully",
      data: result,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   WEBHOOK: STATUS UPDATE
========================= */

exports.shiprocketWebhook = async (req, res) => {
  try {
    await ShiprocketService.updateStatusFromWebhook(req.body);
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
};
