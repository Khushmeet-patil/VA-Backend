const vendorReverifyRejectedTemplate = ({
  vendorName,
  reason,
  platformName,
  supportEmail,
  year,
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Vendor Re-Verification Rejected</title>
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
                ❌ Re-Verification Rejected
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
                Dear <strong>${vendorName}</strong>,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                Your recent profile update could not be approved after review.
                Please see the reason below and update your information again.
              </p>

              <!-- Reason -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fef2f2; border:1px solid #fecaca;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 12px; font-size:16px; color:#7f1d1d;">
                      📝 Reason
                    </h3>
                    <p style="margin:0; font-size:14px; color:#991b1b;">
                      ${reason}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;">
                Need help? Contact us at
                <a href="mailto:${supportEmail}" style="color:#dc2626;">
                  ${supportEmail}
                </a>
              </p>

              <p style="margin-top:28px; font-size:14px;">
                Regards,<br />
                <strong>${platformName} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb; padding:16px; text-align:center;
              font-size:12px; color:#6b7280;">
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

module.exports = vendorReverifyRejectedTemplate;
