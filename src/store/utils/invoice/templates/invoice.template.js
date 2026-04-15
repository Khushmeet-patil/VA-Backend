const invoiceTemplate = ({
  invoiceNumber,
  orderNumber,
  invoiceDate,
  orderDate,
  customer,
  items,
  summary,
  platform,
}) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #333;
      padding: 30px;
      font-size: 12px;
    }
    h1, h2, h3 {
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .company {
      font-size: 14px;
    }
    .invoice-details {
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    table, th, td {
      border: 1px solid #ddd;
    }
    th {
      background: #f5f5f5;
      padding: 8px;
      text-align: left;
    }
    td {
      padding: 8px;
    }
    .summary {
      margin-top: 20px;
      width: 40%;
      float: right;
    }
    .summary td {
      border: none;
      padding: 5px;
    }
    .total {
      font-weight: bold;
      font-size: 14px;
    }
    .footer {
      margin-top: 50px;
      font-size: 11px;
      text-align: center;
      color: #666;
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="company">
      <h2>${platform.name}</h2>
      <p>Email: ${platform.email}</p>
    </div>

    <div class="invoice-details">
      <p><strong>Invoice No:</strong> ${invoiceNumber}</p>
      <p><strong>Order No:</strong> ${orderNumber}</p>
      <p><strong>Invoice Date:</strong> ${invoiceDate}</p>
      <p><strong>Order Date:</strong> ${orderDate}</p>
    </div>
  </div>

  <h3>Bill To:</h3>
  <p>
    <strong>${customer.name}</strong><br/>
    ${customer.email}<br/>
    ${customer.address}
  </p>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Qty</th>
        <th>Price</th>
        <th>GST %</th>
        <th>GST Amt</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>₹${item.price.toFixed(2)}</td>
          <td>${item.gstRate}%</td>
          <td>₹${item.gstAmount.toFixed(2)}</td>
          <td>₹${item.totalPrice.toFixed(2)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <table class="summary">
    <tr>
      <td>Subtotal</td>
      <td>₹${summary.subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td>GST</td>
      <td>₹${summary.gst.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Shipping</td>
      <td>₹${summary.shippingFee.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Discount</td>
      <td>-₹${summary.discount.toFixed(2)}</td>
    </tr>
    <tr class="total">
      <td>Grand Total</td>
      <td>₹${summary.grandTotal.toFixed(2)}</td>
    </tr>
  </table>

  <div class="footer">
    <p>This is a system-generated invoice.</p>
    <p>Thank you for shopping with ${platform.name}!</p>
  </div>

</body>
</html>
`;
};

module.exports =invoiceTemplate