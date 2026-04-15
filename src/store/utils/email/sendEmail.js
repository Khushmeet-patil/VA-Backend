const nodemailer = require("nodemailer");
const logger = require("../logger");

const port = parseInt(process.env.STORE_EMAIL_PORT) || 587;
const secure = port === 465;

const transporter = nodemailer.createTransport({
  host: process.env.STORE_EMAIL_HOST,
  port: port,
  secure: secure,
  auth: {
    user: process.env.STORE_EMAIL_USER,
    pass: process.env.STORE_EMAIL_PASS,
  },
  // Standardized TLS settings for better compatibility
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2"
  },
  connectionTimeout: 20000, 
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

const sendEmail = async ({ to, subject, html }) => {
  const currentHost = process.env.STORE_EMAIL_HOST;
  const currentPort = port;
  
  console.log(`Email Attempt: To=${to}, Subject="${subject}", Host=${currentHost}, Port=${currentPort}`);

  try {
    // Verify connection before sending
    await transporter.verify();
    
    const info = await transporter.sendMail({
      from: `"${process.env.STORE_EMAIL_FROM || 'VedicStore'}" <${process.env.STORE_EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    logger.info("Email sent successfully", {
      to,
      subject,
      messageId: info.messageId,
    });

    return info;
  } catch (error) {
    logger.error("Email sending failed", {
      to,
      subject,
      host: currentHost,
      port: currentPort,
      errorMessage: error.message,
      errorCode: error.code,
      command: error.command,
      response: error.response
    });
    
    console.error("Nodemailer Error Details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });

    throw new Error(`Email failure: ${error.message} (Host: ${currentHost}:${currentPort})`);
  }
};

module.exports = sendEmail;
