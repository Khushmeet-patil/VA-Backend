const returnRequestedTemplate = ({
  vendorName,
  orderId,
  returnType, // 'return' or 'replace'
  items = [],
  reason,
  customerName,
  platformName,
  supportEmail,
  year,
}) => {
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.name}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">
          ${item.quantity}
        </td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">
          ₹${item.price.toLocaleString("en-IN")}
        </td>
      </tr>
    `
    )
    .join("");

  const title = returnType === "return" ? "Refund Requested" : "Replacement Requested";
  const icon = returnType === "return" ? "💰" : "🔄";
  const color = returnType === "return" ? "#dc2626" : "#2563eb"; // Red for refund, Blue for replace

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px">
        <table width="600" style="background:#fff;border-radius:12px;overflow:hidden">

          <!-- Header -->
          <tr>
            <td style="background:${color};color:#fff;padding:24px;text-align:center">
              <h2 style="margin:0">${icon} ${title}</h2>
              <p style="margin:6px 0 0">${platformName}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;color:#1f2937">
              <p>Hello <strong>${vendorName}</strong>,</p>
              <p>A new <strong>${returnType}</strong> request has been filed for an order.</p>

              <p><strong>Order ID:</strong> ${orderId}</p>
              <p><strong>Reason:</strong> ${reason}</p>

              <!-- Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="padding:10px;text-align:left">Product</th>
                    <th style="padding:10px;text-align:center">Qty</th>
                    <th style="padding:10px;text-align:right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>

              <p style="margin-top:24px"><strong>Customer Name:</strong> ${customerName}</p>

              <p style="margin-top:24px">
                Please review this request from your dashboard.
              </p>

              <p style="font-size:14px">
                Need help? Contact us at
                <a href="mailto:${supportEmail}" style="color:${color}">
                  ${supportEmail}
                </a>
              </p>

              <p style="margin-top:24px">
                Regards,<br/>
                <strong>${platformName} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:12px;text-align:center;font-size:12px;color:#6b7280">
              © ${year} ${platformName}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

module.exports = returnRequestedTemplate;
