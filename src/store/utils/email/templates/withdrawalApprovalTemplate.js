exports.withdrawalApprovedTemplate = ({
  vendorName,
  amount,
  withdrawalId,
  approvedDate,
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
  <title>Withdrawal Approved</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Segoe UI', Tahoma, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#ffffff; border-radius:14px; overflow:hidden;
          box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#22c55e); padding:30px 24px; text-align:center;">
              <h1 style="margin:0; font-size:26px; color:#ffffff;">
                ✅ Withdrawal Approved
              </h1>
              <p style="margin-top:8px; font-size:14px; color:#dcfce7;">
                Your payout is on the way
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:34px 30px; color:#1f2937;">
              <p style="font-size:16px;">
                Hi <strong>${vendorName}</strong>,
              </p>

              <p style="font-size:15px; line-height:1.6;">
                We’re happy to inform you that your
                <strong style="color:#16a34a;">withdrawal request has been approved</strong>.
              </p>

              <!-- DETAILS CARD -->
              <table width="100%" style="background:#f9fafb; border:1px solid #e5e7eb;
                border-radius:12px; margin:24px 0;">
                <tr>
                  <td style="padding:22px;">
                    <h3 style="margin:0 0 12px 0;">📄 Withdrawal Details</h3>

                    <table width="100%" cellpadding="6">
                      <tr>
                        <td><strong>Amount</strong></td>
                        <td>₹${amount}</td>
                      </tr>
                      <tr>
                        <td><strong>Request ID</strong></td>
                        <td>${withdrawalId}</td>
                      </tr>
                      <tr>
                        <td><strong>Approved On</strong></td>
                        <td>${approvedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- INFO BOX -->
              <table width="100%" style="background:#ecfeff; border:1px solid #67e8f9;
                border-radius:12px; margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0; font-size:14px; line-height:1.6;">
                      💳 The approved amount will be credited to your
                      <strong>registered bank account within 24 hours</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin-top:28px; font-size:14px;">
                Need assistance? Reach us at
                <a href="mailto:${supportEmail}">${supportEmail}</a>
              </p>

              <p style="margin-top:32px;">
                Regards,<br/>
                <strong>${platformName} – Finance Team</strong>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
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
