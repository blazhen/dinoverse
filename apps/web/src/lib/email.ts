import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'DinoVerse <onboarding@resend.dev>';

// Lazily construct the client so importing this module never throws when
// RESEND_API_KEY is absent (e.g. during a build with no env vars set).
let resend: Resend | null = null;
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set — cannot send email.');
  }
  resend ??= new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    // Surface the failure so the auth flow can log it; don't leak details to the client.
    throw new Error(`Email send failed: ${error.message}`);
  }
}

export function resetPasswordEmail(url: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 22px;">🦕 Reset your DinoVerse password</h1>
      <p>A password reset was requested for your parent account. Tap the button below to choose a new password. This link expires in 1 hour.</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">Reset password</a>
      </p>
      <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}
