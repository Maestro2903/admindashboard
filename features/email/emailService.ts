import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = 'onboarding@resend.dev';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
  }>;
}

export const emailTemplates = {
  passConfirmation: (data: {
    name: string;
    amount: number;
    passType: string;
    college: string;
    phone: string;
    qrCodeUrl: string;
  }) => ({
    subject: 'Your Pass for CIT Takshashila 2026',
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="color: #7c3aed; font-size: 24px; font-weight: 800; margin-bottom: 16px;">Registration Confirmed!</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">
          Hi <strong>${data.name}</strong>, your payment of <strong>₹${data.amount}</strong> has been successfully processed.
        </p>
        
        <div style="background: #f3f4f6; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0; font-size: 16px;"><strong>Pass Type:</strong> ${data.passType}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>College:</strong> ${data.college}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Phone:</strong> ${data.phone}</p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <p style="font-weight: 600; margin-bottom: 16px;">Your Entry QR Code:</p>
          <img src="${data.qrCodeUrl}" alt="Registration QR Code" style="width: 250px; height: 250px; border: 4px solid #7c3aed; border-radius: 12px;" />
          <p style="font-size: 14px; color: #ef4444; margin-top: 12px;">*Please keep this QR code secure and present it at the venue.</p>
        </div>

        <p style="font-size: 14px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center;">
          See you at CIT Takshashila 2026!<br>
          <a href="https://takshashila26.in" style="color: #7c3aed; text-decoration: none;">takshashila26.in</a>
        </p>
      </div>
    `,
  }),
};

export async function sendEmail({ to, subject, html, attachments }: EmailData) {
  if (!resend) {
    console.warn('Resend is not initialized. Skipping email.');
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const emailPayload: { from: string; to: string; subject: string; html: string; attachments?: typeof attachments } = {
      from: FROM_EMAIL,
      to,
      subject,
      html,
    };

    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('Error sending email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Fatal error sending email:', err);
    return { success: false, error: err };
  }
}
