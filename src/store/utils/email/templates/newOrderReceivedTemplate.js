const newOrderReceivedTemplate = ({
  vendorName,
  orderNumber,
  products = [],
  customerName,
  shippingAddress,
  platformName,
  supportEmail,
  year,
}) => {
  const productRows = products
    .map(
      (item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.name}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">
          ${item.quantity}
        </td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">
          ₹${item.totalPrice.toLocaleString("en-IN")}
        </td>
      </tr>
    `
    )
    .join("");

  const totalAmount = products.reduce(
    (sum, item) => sum + Number(item.totalPrice),
    0
  );

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
            <td style="background:#16a34a;color:#fff;padding:24px;text-align:center">
              <h2 style="margin:0">🛒 New Order Received</h2>
              <p style="margin:6px 0 0">${platformName}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;color:#1f2937">
              <p>Hello <strong>${vendorName}</strong>,</p>
              <p>You have received a new order.</p>

              <p><strong>Order Number:</strong> ${orderNumber}</p>

              <!-- Products Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px">
                <thead>
                  <tr style="background:#f0fdf4">
                    <th style="padding:10px;text-align:left">Product</th>
                    <th style="padding:10px;text-align:center">Qty</th>
                    <th style="padding:10px;text-align:right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${productRows}
                </tbody>
              </table>

              <p style="margin-top:16px;font-size:15px">
                <strong>Total Amount:</strong> ₹${totalAmount.toLocaleString("en-IN")}
              </p>

              <p><strong>Customer Name:</strong> ${customerName}</p>

              <p>
                <strong>Shipping Address:</strong><br />
                ${shippingAddress}
              </p>

              <p style="margin-top:24px">
                Please process this order from your vendor dashboard.
              </p>

              <p style="font-size:14px">
                Need help? Contact us at
                <a href="mailto:${supportEmail}" style="color:#16a34a">
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

module.exports = newOrderReceivedTemplate;
