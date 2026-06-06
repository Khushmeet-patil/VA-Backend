const invoiceTemplate = ({
  invoiceNumber,
  orderNumber,
  invoiceDate,
  orderDate,
  orderStatus,
  paymentStatus,
  paymentMethod,
  customer,
  items,
  summary,
  platform,
}) => {
  // Format status strings for display
  const orderStatusDisplay = (orderStatus || "pending").toUpperCase();
  const paymentStatusDisplay = (paymentStatus || "pending").toUpperCase();
  const paymentMethodDisplay = (paymentMethod || "prepaid").toUpperCase();

  // Determine badge colors
  const getStatusColor = (status) => {
    const s = String(status).toLowerCase();
    if (["completed", "delivered", "paid"].includes(s)) return "#10B981"; // green
    if (["pending", "processing", "confirmed"].includes(s)) return "#FF6B00"; // orange
    if (["cancelled", "failed"].includes(s)) return "#EF4444"; // red
    return "#6B7280"; // gray
  };

  const orderStatusColor = getStatusColor(orderStatus);
  const paymentStatusColor = getStatusColor(paymentStatus);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Invoice - ${invoiceNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1F2937;
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
      background-color: #FFFFFF;
    }
    .invoice-container {
      width: 100%;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .header-table td {
      border: none;
      padding: 0;
      vertical-align: top;
    }
    .logo-container {
      text-align: left;
    }
    .logo-title {
      font-size: 28px;
      font-weight: 800;
      color: #FF6B00;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .logo-subtitle {
      font-size: 11px;
      font-weight: 600;
      color: #4B5563;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 2px 0 0 0;
    }
    .logo-operated {
      font-size: 10px;
      color: #9CA3AF;
      margin: 5px 0 0 0;
      font-style: italic;
    }
    .meta-container {
      text-align: right;
    }
    .meta-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 10px 0;
    }
    .meta-text {
      font-size: 12px;
      color: #4B5563;
      margin: 3px 0;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 4px;
      color: #FFFFFF;
      text-transform: uppercase;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .details-table td {
      border: none;
      padding: 0;
      width: 50%;
      vertical-align: top;
    }
    .details-box {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 15px;
      height: 90px;
    }
    .details-box.left {
      margin-right: 10px;
    }
    .details-box.right {
      margin-left: 10px;
    }
    .details-heading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #9CA3AF;
      margin: 0 0 8px 0;
      letter-spacing: 0.5px;
    }
    .details-value {
      font-size: 13px;
      color: #1F2937;
      margin: 0;
      line-height: 1.4;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      margin-bottom: 20px;
    }
    .items-table th {
      background-color: #F9FAFB;
      border-bottom: 2px solid #E5E7EB;
      color: #374151;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      padding: 10px 12px;
      text-align: left;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #F3F4F6;
      font-size: 12px;
      color: #4B5563;
    }
    .items-table .text-right {
      text-align: right;
    }
    .items-table .text-center {
      text-align: center;
    }
    .summary-table {
      width: 45%;
      float: right;
      border-collapse: collapse;
      margin-bottom: 40px;
    }
    .summary-table td {
      padding: 6px 12px;
      font-size: 13px;
      color: #4B5563;
      border: none;
    }
    .summary-table .label {
      text-align: left;
    }
    .summary-table .val {
      text-align: right;
      font-weight: 600;
      color: #1F2937;
    }
    .summary-table tr.total-row td {
      border-top: 2px solid #E5E7EB;
      padding-top: 12px;
      font-size: 15px;
      font-weight: 700;
      color: #111827;
    }
    .summary-table tr.total-row .val {
      color: #FF6B00;
      font-size: 16px;
      font-weight: 800;
    }
    .summary-table tr.ppcod-split td {
      font-size: 11px;
      color: #6B7280;
      padding: 4px 12px;
    }
    .summary-table tr.ppcod-split.first td {
      border-top: 1px dashed #E5E7EB;
      padding-top: 8px;
    }
    .summary-table tr.ppcod-split.collectable .val {
      color: #FF6B00;
      font-weight: 700;
    }
    .clear {
      clear: both;
    }
    .footer {
      border-top: 1px solid #E5E7EB;
      margin-top: 60px;
      padding-top: 20px;
      text-align: center;
      font-size: 11px;
      color: #9CA3AF;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>

  <div class="invoice-container">
    <!-- Header banner -->
    <table class="header-table">
      <tr>
        <td class="logo-container">
          <h1 class="logo-title">${platform.name}</h1>
          <p class="logo-subtitle">VedicStore Marketplace</p>
          <p class="logo-operated">Operated by: ${platform.operatedBy}</p>
        </td>
        <td class="meta-container">
          <h2 class="meta-title">INVOICE</h2>
          <p class="meta-text"><strong>Invoice No:</strong> ${invoiceNumber}</p>
          <p class="meta-text"><strong>Order ID:</strong> #${orderNumber}</p>
          <p class="meta-text"><strong>Order Date:</strong> ${orderDate}</p>
          <p class="meta-text"><strong>Invoice Date:</strong> ${invoiceDate}</p>
        </td>
      </tr>
    </table>

    <!-- Status and Details -->
    <table class="details-table">
      <tr>
        <td>
          <div class="details-box left">
            <h3 class="details-heading">Bill To</h3>
            <p class="details-value">
              <strong>${customer.name}</strong><br/>
              ${customer.email}<br/>
              ${customer.address}
            </p>
          </div>
        </td>
        <td>
          <div class="details-box right">
            <h3 class="details-heading">Payment & Delivery</h3>
            <p class="details-value">
              <strong>Payment Method:</strong> ${paymentMethodDisplay}<br/>
              <strong>Payment Status:</strong> <span class="badge" style="background-color: ${paymentStatusColor}">${paymentStatusDisplay}</span><br/>
              <strong>Order Status:</strong> <span class="badge" style="background-color: ${orderStatusColor}">${orderStatusDisplay}</span>
            </p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Items table -->
    <table class="items-table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-center">GST %</th>
          <th class="text-right">GST Amt</th>
          <th class="text-right">Total Price</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            <td>
              <strong>${item.name}</strong>
              ${item.size ? `<br/><span style="font-size: 10px; color: #9CA3AF;">Size: ${item.size}</span>` : ""}
            </td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-right">₹${item.price.toFixed(2)}</td>
            <td class="text-center">${item.gstRate}%</td>
            <td class="text-right">₹${item.gstAmount.toFixed(2)}</td>
            <td class="text-right">₹${item.totalPrice.toFixed(2)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    <!-- Pricing Summary -->
    <table class="summary-table">
      <tr>
        <td class="label">Items Subtotal</td>
        <td class="val">₹${summary.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">Estimated GST</td>
        <td class="val">₹${summary.gst.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">Delivery Fee</td>
        <td class="val">${summary.shippingFee > 0 ? `₹${summary.shippingFee.toFixed(2)}` : "FREE"}</td>
      </tr>
      ${summary.platformFee > 0 ? `
      <tr>
        <td class="label">Platform Fee</td>
        <td class="val">₹${summary.platformFee.toFixed(2)}</td>
      </tr>
      ` : ""}
      ${summary.discount > 0 ? `
      <tr>
        <td class="label" style="color: #10B981;">Discounts & Coupons</td>
        <td class="val" style="color: #10B981;">-₹${summary.discount.toFixed(2)}</td>
      </tr>
      ` : ""}
      <br/>
      <tr class="total-row">
        <td class="label">Total Paid</td>
        <td class="val">₹${summary.grandTotal.toFixed(2)}</td>
      </tr>
      ${
        summary.advanceCod && summary.advanceCod.advanceAmount > 0
          ? `
        <tr class="ppcod-split first">
          <td class="label">Prepaid Upfront Amount (Paid)</td>
          <td class="val">₹${summary.advanceCod.advanceAmount.toFixed(2)}</td>
        </tr>
        <tr class="ppcod-split collectable">
          <td class="label">Collectable on Delivery (Balance)</td>
          <td class="val">₹${summary.advanceCod.collectableAmount.toFixed(2)}</td>
        </tr>
        `
          : ""
      }
    </table>
    <div class="clear"></div>

    <!-- Footer -->
    <div class="footer">
      <p>This is a computer-generated invoice and does not require a signature.</p>
      <p>Thank you for shopping on <strong>${platform.name}</strong>!</p>
      <p style="font-size: 9px; color: #D1D5DB; margin-top: 15px;">Support: ${platform.email} | Legal Entity: ${platform.operatedBy}</p>
    </div>
  </div>

</body>
</html>
  `;
};

module.exports = invoiceTemplate;