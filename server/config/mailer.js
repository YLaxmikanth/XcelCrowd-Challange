const nodemailer = require("nodemailer");

const createTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true
  });
};

const transporter = createTransporter();

exports.sendShortlistedEmail = async (applicant) => {
  if (!applicant.email) return;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || "XcelCrowd <no-reply@xcelcrowd.local>",
      to: applicant.email,
      subject: "You have been shortlisted",
      text:
        `Hi ${applicant.name},\n\n` +
        "You have been shortlisted. Please acknowledge your active review slot in XcelCrowd.\n\n" +
        "Thanks,\nXcelCrowd"
    });
  } catch (error) {
    console.error("Failed to send shortlist email:", error.message);
  }
};
