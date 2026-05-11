import nodemailer from 'nodemailer';

export const sendResetPasswordEmail = async (to, token) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || 'user',
      pass: process.env.SMTP_PASS || 'pass',
    },
  });

  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const resetLink = `${clientOrigin}/#reset-password?token=${token}`;

  await transporter.sendMail({
    from: '"HAM Support" <noreply@ham.example.com>',
    to,
    subject: 'Password Reset Request',
    text: `To reset your password, please click the following link: ${resetLink}`,
    html: `
      <div style="background-color:#00BFFF;padding:24px;">
        <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:3px solid #000;border-radius:12px;padding:24px;font-family:Trebuchet MS, Arial, sans-serif;color:#000;">
          <h1 style="margin:0 0 12px 0;font-size:28px;">Mathematical!</h1>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.4;">Don't be a lemon, reset your password!</p>
          <p style="margin:0 0 24px 0;font-size:16px;">Click the big button below to set a new password.</p>
          <a href="${resetLink}" style="display:inline-block;background-color:#FFCC00;color:#000;text-decoration:none;padding:14px 24px;border:3px solid #000;border-radius:12px;font-weight:bold;font-size:16px;">Reset Password</a>
          <p style="margin:24px 0 0 0;font-size:12px;">If you did not request this, you can ignore this email.</p>
        </div>
      </div>
    `,
  });
};
