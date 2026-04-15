const vendorReverifyApprovedTemplate = ({
  vendorName,
  platformName,
  supportEmail,
  year,
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Vendor Profile Re-Verified</title>
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
            <td style="background:linear-gradient(135deg,#16a34a,#15803d); padding:28px; text-align:center;">
              <h1 style="margin:0; font-size:24px; color:#ffffff;">
                ✅ Profile Re-Verification Approved
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#dcfce7;">
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
                We’re happy to inform you that your recently updated profile
                details have been <strong style="color:#16a34a;">successfully reviewed
                and approved</strong>.
              </p>

              <!-- Success Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f0fdf4; border:1px solid #bbf7d0;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0; font-size:14px; color:#166534;">
                      ✔ Your vendor account is now fully verified again.<br />
                      ✔ All platform features are re-enabled.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px; line-height:1.6;">
                You may now continue using all services without any restrictions,
                including payouts and order management.
              </p>

              <p style="font-size:14px; margin-top:20px;">
                Need help? Reach us at
                <a href="mailto:${supportEmail}" style="color:#16a34a; text-decoration:none;">
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

module.exports = vendorReverifyApprovedTemplate;
