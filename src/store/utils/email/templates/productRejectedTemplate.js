const productRejectedTemplate = ({
  vendorName,
  productName,
  rejectionReason,
  platformName,
  supportEmail,
  year,
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Product Rejected</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Segoe UI', Tahoma, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#ffffff; border-radius:12px; overflow:hidden;
          box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#dc2626,#b91c1c); padding:28px; text-align:center;">
              <h1 style="margin:0; font-size:24px; color:#ffffff;">
                ❌ Product Rejected
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#fee2e2;">
                ${platformName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 28px; color:#1f2937;">
              <p style="font-size:16px;">
                Hello <strong>${vendorName}</strong>,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                Thank you for submitting your product
                <strong>"${productName}"</strong> for review on
                <strong>${platformName}</strong>.
              </p>

              <p style="font-size:15px; line-height:1.6;">
                After careful evaluation, we regret to inform you that your
                product has not been approved at this time.
              </p>

              <!-- Rejection Reason -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fef2f2; border:1px solid #fecaca;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:18px; font-size:14px; color:#7f1d1d;">
                    <strong>Reason for rejection:</strong><br /><br />
                    ${rejectionReason}
                  </td>
                </tr>
              </table>

              <p style="font-size:14px; line-height:1.6;">
                You may update the product details based on the feedback above
                and resubmit it for approval.
              </p>

              <p style="font-size:14px; margin-top:24px;">
                If you need any clarification, please contact us at
                <a href="mailto:${supportEmail}" style="color:#dc2626; text-decoration:none;">
                  ${supportEmail}
                </a>
              </p>

              <p style="margin-top:32px; font-size:14px;">
                Regards,<br />
                <strong>${platformName} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb; padding:16px; text-align:center; font-size:12px; color:#6b7280;">
              © ${year} ${platformName}. All rights reserved.
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

module.exports = productRejectedTemplate;
