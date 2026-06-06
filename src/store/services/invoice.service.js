const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const Order = require("../models/Order");
const invoiceTemplate = require("../utils/invoice/templates/invoice.template");

exports.generateInvoice = async (orderId) => {
  const order = await Order.findById(orderId).populate(
    "customerId",
    "firstName lastName email"
  );

  if (!order) {
    throw new Error("Order not found");
  }

  const platformFee = Number(order.platformFee || 0);
  const isAdvanceCod = order.paymentMethod === "advance_cod";

  const invoiceHtml = invoiceTemplate({
    invoiceNumber: `INV-${order.orderNumber}`,
    orderNumber: order.orderNumber,
    invoiceDate: new Date().toDateString(),
    orderDate: new Date(order.createdAt).toDateString(),
    paymentMethod: String(order.paymentMethod || "").toUpperCase().replace(/_/g, " "),
    paymentStatus: String(order.paymentStatus || "").toUpperCase(),
    orderStatus: String(order.orderStatus || "").toUpperCase(),

    customer: {
      name: order.shippingAddress?.fullName || `${order.customerId?.firstName || ""} ${order.customerId?.lastName || ""}`.trim(),
      email: order.customerId?.email || "",
      phone: order.shippingAddress?.phone || "",
      address: `${order.shippingAddress?.addressLine1 || ""}, ${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""} - ${order.shippingAddress?.postalCode || ""}`,
    },

    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price ?? 0),
      gstRate: Number(item.gstRate ?? 0),
      gstAmount: Number(item.gstAmount ?? 0),
      totalPrice: Number(item.totalPrice ?? 0),
    })),

    summary: {
      subtotal: order.subtotal,
      gst: order.tax,
      shippingFee: order.shippingFee,
      platformFee: platformFee,
      discount: order.discount,
      grandTotal: order.totalAmount,
      advanceCod: isAdvanceCod ? {
        advanceAmount: order.advanceCod?.advanceAmount || 0,
        collectableAmount: order.advanceCod?.collectableAmount || 0,
      } : null,
    },

    platform: {
      name: "VedicAstro",
      companyName: "RASHIGURU ASTROLOGY AND SULITION",
      email: "support@vedicastro.co.in",
    },
  });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(invoiceHtml, { waitUntil: "networkidle0" });

  const invoicesDir = path.join(__dirname, "../../uploads/invoices");
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  const filePath = path.join(invoicesDir, `invoice-${order.orderNumber}.pdf`);

  await page.pdf({
    path: filePath,
    format: "A4",
    printBackground: true,
  });

  await browser.close();

  return filePath;
};
