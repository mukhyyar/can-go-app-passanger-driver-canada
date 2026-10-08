import { layout, escapeHtml } from './layout';

export interface KycUnderReviewVars {
  driverName: string;
}

export function renderKycUnderReview(vars: KycUnderReviewVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const html = layout(`
    <h2 style="margin-top:0;">Documents Under Review ⏳</h2>
    <p>Hi ${name},</p>
    <p>We've received all your required documents. Our compliance team is currently reviewing them.</p>
    <p>This process usually takes 1-2 business days. We will notify you via email and push notification as soon as a decision is made.</p>
  `, assetBaseUrl);

  return { subject: 'CAN-RIDE: Documents Under Review', html };
}
