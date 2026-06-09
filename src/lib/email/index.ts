type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP2GO_API_KEY && process.env.SMTP2GO_SENDER_EMAIL);
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  const senderEmail = process.env.SMTP2GO_SENDER_EMAIL;
  const senderName = process.env.SMTP2GO_SENDER_NAME ?? "Nexus";

  if (!apiKey || !senderEmail) {
    console.warn("[email] SMTP2go not configured — skipping send:", input.subject);
    return { ok: false, skipped: true };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": apiKey,
    },
    body: JSON.stringify({
      sender: `${senderName} <${senderEmail}>`,
      to: recipients,
      subject: input.subject,
      text_body: input.text,
      html_body: input.html ?? input.text.replace(/\n/g, "<br>"),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SMTP2go error (${response.status}): ${body}`);
  }

  return { ok: true };
}

export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  const subject = "Welcome to Nexus";
  const text = [
    `Hi ${input.name},`,
    "",
    "An administrator has created a Nexus account for you.",
    "",
    `Sign in: ${input.loginUrl}`,
    `Email: ${input.to}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "On first sign-in you will need to complete two-factor authentication setup (unless you are an administrator).",
    "Your account starts as pending until an administrator elevates your access.",
  ].join("\n");

  return sendEmail({ to: input.to, subject, text });
}

export async function sendPendingUserLoginAlert(input: {
  adminEmails: string[];
  userName: string;
  userEmail: string;
  adminUrl: string;
}) {
  if (!input.adminEmails.length) return { ok: false, skipped: true };

  const subject = `Nexus: pending user signed in — ${input.userName}`;
  const text = [
    `${input.userName} (${input.userEmail}) signed in for the first time.`,
    "",
    "Please review and elevate their account status in the Admin Panel.",
    "",
    `Admin panel: ${input.adminUrl}`,
  ].join("\n");

  return sendEmail({ to: input.adminEmails, subject, text });
}

export async function sendTwoFactorEmailCode(input: {
  to: string;
  name: string;
  code: string;
}) {
  const subject = "Your Nexus verification code";
  const text = [
    `Hi ${input.name},`,
    "",
    `Your verification code is: ${input.code}`,
    "",
    "This code expires in 10 minutes.",
  ].join("\n");

  return sendEmail({ to: input.to, subject, text });
}
