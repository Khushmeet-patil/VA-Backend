const KwikshipService = require("../services/kwikship.service.js");

/* =========================
   ADMIN: ADD / UPDATE ACCOUNT
========================= */

exports.addKwikshipAccount = async (req, res) => {
  try {
    const account = await KwikshipService.storeAccount(req.body);

    res.status(201).json({
      success: true,
      message: "Kwikship account added",
      data: account,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getActiveKwikshipAccount = async (req, res) => {
  try {
    const account = await KwikshipService.getActiveAccount();
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

    const result = await KwikshipService.createFullShipment(orderId);

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
   TRACKING: FETCH STATUS
======================== */

exports.getTrackingStatus = async (req, res) => {
    try {
        const { waybill } = req.params;
        const result = await KwikshipService.fetchStatus(waybill);
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}
