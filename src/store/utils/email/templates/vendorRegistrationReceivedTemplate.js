const vendorRegistrationReceivedTemplate = ({
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vendor Registration Received</title>
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
            <td style="background:linear-gradient(135deg,#0f766e,#0d9488); padding:28px; text-align:center;">
              <h1 style="margin:0; font-size:24px; color:#ffffff;">
                📝 Vendor Registration Received
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#ccfbf1;">
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
                Thank you for registering as a vendor on
                <strong>${platformName}</strong>.
                We have successfully received your vendor application.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f0fdfa; border:1px solid #99f6e4;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:18px; font-size:14px; color:#134e4a;">
                    📌 <strong>Current Status:</strong>
                    <span style="font-weight:600;">Under Review</span>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px; line-height:1.6;">
                Our team is currently reviewing your submitted information.
                This process usually takes <strong>24–48 business hours</strong>.
                Once the review is complete, you will receive an email notification
                regarding approval or rejection.
              </p>

              <p style="font-size:14px; line-height:1.6;">
                Please ensure that all submitted details are accurate and complete
                to avoid any delays in the approval process.
              </p>

              <p style="font-size:14px; margin-top:20px;">
                If you have any questions or need assistance, feel free to reach out to us at
                <a href="mailto:${supportEmail}" style="color:#0d9488; text-decoration:none;">
                  ${supportEmail}
                </a>.
              </p>

              <p style="margin-top:32px; font-size:14px;">
                Thank you for your interest in partnering with us.<br />
                We appreciate your patience.
              </p>

              <p style="margin-top:24px; font-size:14px;">
                Sincerely,<br />
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

module.exports = vendorRegistrationReceivedTemplate;
