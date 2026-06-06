const invoiceTemplate = ({
  invoiceNumber,
  orderNumber,
  invoiceDate,
  orderDate,
  paymentMethod,
  paymentStatus,
  orderStatus,
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
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      padding: 40px;
      font-size: 13px;
      line-height: 1.5;
    }
    .invoice-card {
      max-width: 800px;
      margin: auto;
      border: 1px solid #eee;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
      padding: 30px;
      border-radius: 8px;
    }
    .header-bar {
      height: 6px;
      background: linear-gradient(90deg, #FF6B00 0%, #FFA800 100%);
      margin: -30px -30px 30px -30px;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-icon {
      width: 24px;
      height: 24px;
      background: #FF6B00;
      border-radius: 6px;
      transform: rotate(45deg);
    }
    .logo-text {
      font-size: 24px;
      font-weight: 800;
      color: #1a1a1a;
      letter-spacing: -0.5px;
    }
    .logo-text span {
      color: #FF6B00;
    }
    .company-details {
      margin-top: 8px;
      font-size: 11px;
      color: #666;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-title {
      font-size: 26px;
      font-weight: 800;
      color: #FF6B00;
      text-transform: uppercase;
      margin-bottom: 10px;
      letter-spacing: 1px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: auto auto;
      gap: 5px 15px;
      font-size: 12px;
      justify-content: end;
      text-align: left;
    }
    .meta-grid div:nth-child(odd) {
      font-weight: bold;
      color: #555;
    }
    .meta-grid div:nth-child(even) {
      text-align: right;
      color: #222;
    }
    .address-section {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      margin-bottom: 40px;
      background: #fafafa;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #f0f0f0;
    }
    .address-box {
      flex: 1;
    }
    .address-title {
      font-size: 11px;
      text-transform: uppercase;
      color: #888;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .address-content {
      font-size: 12px;
      color: #333;
      line-height: 1.4;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 30px;
      margin-bottom: 30px;
    }
    table.items-table th {
      background: #1a1a1a;
      color: #fff;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 10px 12px;
      border: none;
    }
    table.items-table th:first-child {
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
    }
    table.items-table th:last-child {
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
      text-align: right;
    }
    table.items-table td {
      padding: 12px;
      border-bottom: 1px solid #eee;
      font-size: 12px;
      color: #333;
    }
    table.items-table td:last-child {
      text-align: right;
      font-weight: 700;
    }
    .totals-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 20px;
    }
    .payment-badge-container {
      flex: 1.2;
      background: #FFF9F5;
      border: 1px solid #FFE6D5;
      padding: 15px;
      border-radius: 6px;
      margin-right: 40px;
    }
    .badge-title {
      font-size: 11px;
      text-transform: uppercase;
      color: #FF6B00;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .badge-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
      color: #444;
    }
    .badge-row:last-child {
      margin-bottom: 0;
    }
    .badge-row .highlight {
      font-weight: bold;
      color: #FF6B00;
    }
    table.summary-table {
      flex: 1;
      border-collapse: collapse;
    }
    table.summary-table td {
      padding: 6px 10px;
      font-size: 12px;
      color: #555;
    }
    table.summary-table td:last-child {
      text-align: right;
      font-weight: 600;
      color: #1a1a1a;
      width: 120px;
    }
    table.summary-table tr.grand-total-row td {
      padding-top: 12px;
      border-top: 2px solid #1a1a1a;
      font-weight: 800;
      font-size: 15px;
      color: #1a1a1a;
    }
    table.summary-table tr.grand-total-row td:last-child {
      color: #FF6B00;
      font-size: 16px;
    }
    .footer {
      margin-top: 60px;
      border-top: 1px solid #eee;
      padding-top: 20px;
      font-size: 11px;
      text-align: center;
      color: #888;
      line-height: 1.6;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>

  <div class="invoice-card">
    <div class="header-bar"></div>
    
    <div class="header">
      <div>
        <div class="logo-container">
          <div class="logo-icon"></div>
          <div class="logo-text">Vedic<span>Astro</span></div>
        </div>
        <div class="company-details">
          <strong>${platform.companyName}</strong><br/>
          Email: ${platform.email}<br/>
          Support: support@vedicastro.co.in
        </div>
      </div>

      <div class="invoice-meta">
        <div class="invoice-title">Tax Invoice</div>
        <div class="meta-grid">
          <div>Invoice No:</div>
          <div>${invoiceNumber}</div>
          <div>Order ID:</div>
          <div>#${orderNumber}</div>
          <div>Invoice Date:</div>
          <div>${invoiceDate}</div>
          <div>Order Date:</div>
          <div>${orderDate}</div>
        </div>
      </div>
    </div>

    <div class="address-section">
      <div class="address-box">
        <div class="address-title">Billed To</div>
        <div class="address-content">
          <strong>${customer.name}</strong><br/>
          ${customer.email}<br/>
          Phone: ${customer.phone || 'N/A'}
        </div>
      </div>
      <div class="address-box">
        <div class="address-title">Shipped To</div>
        <div class="address-content">
          <strong>${customer.name}</strong><br/>
          ${customer.address}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50%;">Product Details</th>
          <th style="text-align: center; width: 10%;">Qty</th>
          <th style="text-align: right; width: 15%;">Unit Price</th>
          <th style="text-align: center; width: 10%;">GST</th>
          <th style="text-align: right; width: 15%;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            <td><strong>${item.name}</strong></td>
            <td style="text-align: center;">${item.quantity}</td>
            <td style="text-align: right;">₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: center;">${item.gstRate}%</td>
            <td style="text-align: right;">₹${item.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals-container">
      <div class="payment-badge-container">
        <div class="badge-title">Payment Info</div>
        <div class="badge-row">
          <div>Method:</div>
          <div style="font-weight: 700;">${paymentMethod}</div>
        </div>
        <div class="badge-row">
          <div>Payment Status:</div>
          <div style="font-weight: 700; color: ${paymentStatus === 'PAID' ? '#00A859' : '#FF6B00'};">${paymentStatus}</div>
        </div>
        <div class="badge-row">
          <div>Order Status:</div>
          <div style="font-weight: 700;">${orderStatus}</div>
        </div>
        ${summary.advanceCod ? `
          <div class="badge-title" style="margin-top: 15px; border-top: 1px dashed #FFE6D5; padding-top: 10px;">PPCOD Breakdown</div>
          <div class="badge-row">
            <div>Paid Upfront (Prepaid):</div>
            <div class="highlight">₹${summary.advanceCod.advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="badge-row">
            <div>Collectable on Delivery:</div>
            <div class="highlight" style="color: #FF6B00;">₹${summary.advanceCod.collectableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        ` : ''}
      </div>

      <table class="summary-table">
        <tr>
          <td>Subtotal</td>
          <td>₹${summary.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>GST (Tax included)</td>
          <td>₹${summary.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>Shipping Fee</td>
          <td>${summary.shippingFee > 0 ? `₹${summary.shippingFee.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'FREE'}</td>
        </tr>
        ${summary.platformFee > 0 ? `
          <tr>
            <td>Platform/Other Fees</td>
            <td>₹${summary.platformFee.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        ` : ''}
        ${summary.discount > 0 ? `
          <tr>
            <td>Discounts</td>
            <td style="color: #00A859;">-₹${summary.discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        ` : ''}
        <tr class="grand-total-row">
          <td>Grand Total</td>
          <td>₹${summary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <p>This is a computer-generated tax invoice. No signature is required.</p>
      <p>Need support? Contact us at support@vedicastro.co.in or visit our portal.</p>
      <p style="font-weight: 700; color: #555; margin-top: 10px;">Thank you for shopping with VedicAstro!</p>
    </div>
  </div>

</body>
</html>
  `;
};

module.exports = invoiceTemplate;