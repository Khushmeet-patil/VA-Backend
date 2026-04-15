const resetPasswordTemplate = ({
  userName,
  resetUrl,
  platformName,
  supportEmail,
  expiryMinutes,
  year,
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
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
            <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8); padding:28px; text-align:center;">
              <h1 style="margin:0; font-size:24px; color:#ffffff;">
                🔐 Reset Your Password
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#dbeafe;">
                ${platformName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 28px; color:#1f2937;">
              <p style="font-size:16px;">
                Hello <strong>${userName}</strong>,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                We received a request to reset the password for your
                <strong>${platformName}</strong> account.
                Click the button below to set a new password.
              </p>

              <!-- CTA -->
              <div style="text-align:center; margin:32px 0;">
                <a href="${resetUrl}" target="_blank"
                  style="display:inline-block; padding:14px 28px;
                  background:#2563eb; color:#ffffff; font-size:15px;
                  border-radius:10px; text-decoration:none; font-weight:600;">
                  Reset Password →
                </a>
              </div>

              <!-- Expiry Info -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f9fafb; border:1px solid #e5e7eb;
                border-radius:10px; margin:24px 0;">
                <tr>
                  <td style="padding:18px; font-size:14px; color:#374151;">
                    ⏳ This reset link will expire in
                    <strong>${expiryMinutes} minutes</strong>.
                  </td>
                </tr>
              </table>

              <p style="font-size:14px; line-height:1.6;">
                If you did not request a password reset, please ignore this email.
                Your account remains secure.
              </p>

              <p style="font-size:14px; margin-top:24px;">
                Need help? Contact us at
                <a href="mailto:${supportEmail}" style="color:#2563eb; text-decoration:none;">
                  ${supportEmail}
                </a>
              </p>

              <p style="margin-top:32px; font-size:14px;">
                Regards,<br />
                <strong>${platformName}</strong>
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

module.exports = resetPasswordTemplate;
