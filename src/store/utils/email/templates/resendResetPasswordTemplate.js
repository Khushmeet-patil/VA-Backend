module.exports = function resendResetPasswordTemplate({
  userName,
  resetUrl,
  platformName = "VedicStore | VedicAstro",
  supportEmail = "support@vedicastro.co.in",
  expiryMinutes = 30,
  year = new Date().getFullYear(),
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Password</title>
  </head>
  <body style="margin:0; padding:0; background:#f5f7fb; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 15px;">
          <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="background:#1e293b; padding:20px; text-align:center;">
                <h1 style="margin:0; color:#ffffff; font-size:22px;">
                  ${platformName}
                </h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:30px;">
                <p style="font-size:15px; color:#333;">
                  Hi <strong>${userName}</strong>,
                </p>

                <p style="font-size:14px; color:#555; line-height:1.6;">
                  We received a request to reset your password. Please click the button below to create a new password for your account.
                </p>

                <!-- CTA -->
                <div style="text-align:center; margin:30px 0;">
                  <a href="${resetUrl}"
                     style="background:#2563eb; color:#ffffff; text-decoration:none;
                            padding:12px 24px; border-radius:6px;
                            display:inline-block; font-size:14px;">
                    Reset Password
                  </a>
                </div>

                <p style="font-size:13px; color:#666; line-height:1.6;">
                  This link will expire in <strong>${expiryMinutes} minutes</strong>.
                  If you did not request a password reset, you can safely ignore this email.
                </p>

                <p style="font-size:13px; color:#666;">
                  Need help? Contact us at
                  <a href="mailto:${supportEmail}" style="color:#2563eb; text-decoration:none;">
                    ${supportEmail}
                  </a>
                </p>

                <p style="font-size:13px; color:#333; margin-top:25px;">
                  Regards,<br/>
                  <strong>${platformName} Team</strong>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f1f5f9; padding:15px; text-align:center;">
                <p style="margin:0; font-size:12px; color:#777;">
                  © ${year} ${platformName}. All rights reserved.
                </p>
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
