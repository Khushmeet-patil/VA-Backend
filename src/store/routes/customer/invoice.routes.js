const router = require("express").Router();
const invoiceController = require("../../controllers/invoice.controller");

router.get("/:orderId", invoiceController.downloadInvoice);

module.exports = router;
