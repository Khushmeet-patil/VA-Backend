const invoiceService = require("../services/invoice.service");

exports.downloadInvoice = async (req, res) => {
  try {
    const filePath = await invoiceService.generateInvoice(req.params.orderId);
    res.download(filePath);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
