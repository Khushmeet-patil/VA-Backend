const vendorReverifyRequiredTemplate = ({
  vendorName,
  vendorEmail,
  platformName,
  adminPanelUrl,
  year,
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vendor Re-Verification Required</title>
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
            <td style="background:linear-gradient(135deg,#f59e0b,#d97706); padding:28px; text-align:center;">
              <h1 style="margin:0; font-size:24px; color:#ffffff;">
                ⚠️ Vendor Re-Verification Required
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#fef3c7;">
                ${platformName} Admin Notification
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 28px; color:#1f2937;">
              <p style="font-size:16px;">
                Hello Admin,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                The vendor <strong>${vendorName}</strong> has updated
                <strong>sensitive information</strong> (bank / tax / documents).
              </p>

              <!-- Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fffbeb; border:1px solid #fde68a;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0; font-size:14px; color:#92400e;">
                      <strong>Vendor Email:</strong> ${vendorEmail}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px; line-height:1.6;">
                Please review the updated details and approve or reject the
                re-verification request from the admin panel.
              </p>

              <!-- CTA -->
              <p style="margin:28px 0; text-align:center;">
                <a href="${adminPanelUrl}"
                  style="background:#f59e0b; color:#ffffff; padding:12px 24px;
                  border-radius:8px; text-decoration:none; font-size:14px;
                  font-weight:600; display:inline-block;">
                  Review Vendor
                </a>
              </p>

              <p style="font-size:14px;">
                — <strong>${platformName} System</strong>
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

module.exports = vendorReverifyRequiredTemplate;