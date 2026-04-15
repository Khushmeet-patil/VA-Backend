const orderStatusUpdateTemplate = ({
  customerName,
  orderNumber,
  status,
  productName,
  platformName,
  supportEmail,
  year,
}) => {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f4f6f8; font-family:Arial;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" style="background:#fff; border-radius:12px;">
          <tr>
            <td style="background:#2563eb; padding:24px; text-align:center;">
              <h2 style="color:#fff;">Order Update</h2>
            </td>
          </tr>

          <tr>
            <td style="padding:28px;">
              <p>Hello <strong>${customerName}</strong>,</p>
              <p>Your order <strong>${orderNumber}</strong> has been updated.</p>

              <table width="100%" style="background:#eff6ff; border-radius:8px;">
                <tr>
                  <td style="padding:16px;">
                    <strong>Product:</strong> ${productName}<br/>
                    <strong>Status:</strong> ${status}
                  </td>
                </tr>
              </table>

              <p style="margin-top:20px;">
                If you need help, contact us at
                <a href="mailto:${supportEmail}">${supportEmail}</a>
              </p>

              <p>— ${platformName} Team</p>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb; padding:14px; text-align:center; font-size:12px;">
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

module.exports = orderStatusUpdateTemplate;
