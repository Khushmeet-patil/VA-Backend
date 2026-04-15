const vendorApprovedTemplate = ({
  vendorName,
  vendorEmail,
  loginUrl,
  commission,
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
  <title>Vendor Application Approved</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed); padding:28px 24px; text-align:center;">
              <h1 style="margin:0; font-size:26px; color:#ffffff;">
                🎉 Vendor Application Approved
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#e0e7ff;">
                Welcome to ${platformName}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 28px; color:#1f2937;">
              <p style="font-size:16px;">
                Dear <strong>${vendorName}</strong>,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                We are pleased to inform you that your vendor application has been
                <strong style="color:#16a34a;">successfully approved</strong>.
              </p>

              <table width="100%" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin-bottom:12px;">🔐 Vendor Login Details</h3>
                    <p><strong>Email:</strong> ${vendorEmail}</p>
                    <p>
                      <strong>Login URL:</strong>
                      <a href="${loginUrl}">${loginUrl}</a>
                    </p>

                    <a href="${loginUrl}"
                      style="display:inline-block; padding:12px 20px; background:#4f46e5;
                      color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">
                      Login to Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <h3>💰 Commission Structure</h3>
                    <p>
                      <strong>Total Platform Commission:</strong>
                      <span style="color:#16a34a; font-weight:600;">${commission}%</span>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin-top:24px;">
                Need help? Contact us at
                <a href="mailto:${supportEmail}">${supportEmail}</a>
              </p>

              <p style="margin-top:32px;">
                Regards,<br />
                <strong>${platformName} Team</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb; padding:16px; text-align:center; font-size:12px;">
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

module.exports = vendorApprovedTemplate;
