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

  if (
    !order ||
    order.paymentStatus !== "paid" ||
    !["delivered", "completed"].includes(order.orderStatus)
  ) {
    throw new Error("Invoice can be generated only for delivered orders");
  }

  const invoiceHtml = invoiceTemplate({
    invoiceNumber: `INV-${order.orderNumber}`,
    orderNumber: order.orderNumber,
    invoiceDate: new Date().toDateString(),
    orderDate: new Date(order.createdAt).toDateString(),

    customer: {
      name: `${order.customerId.firstName} ${order.customerId.lastName}`,
      email: order.customerId.email,
      address: `${order.shippingAddress.addressLine1}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}`,
    },

    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,

      basePrice: Number(item.basePrice ?? item.price ?? 0),
      discountAmount: Number(item.discountAmount ?? 0),
      discountedPrice: Number(item.discountedPrice ?? item.price ?? 0),

      gstRate: Number(item.gstRate ?? 0),
      gstAmount: Number(item.gstAmount ?? 0),

      price: Number(item.price ?? 0),
      totalPrice: Number(item.totalPrice ?? 0),
    })),

    summary: {
      subtotal: order.subtotal,
      gst: order.tax,
      shippingFee: order.shippingFee,
      discount: order.discount,
      grandTotal: order.totalAmount,
    },

    platform: {
      name: "YourPlatform",
      email: "support@yourplatform.com",
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
