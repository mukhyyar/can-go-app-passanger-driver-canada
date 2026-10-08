import { layout, escapeHtml } from './layout';

export interface AppReceivedVars {
  driverName: string;
}

export function renderAppReceived(vars: AppReceivedVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const html = layout(`
    <h2 style="margin-top:0;">Application Received! 📄</h2>
    <p>Hi ${name},</p>
    <p>Thanks for applying to drive with CAN-RIDE. We've received your initial application.</p>
    <p>To move forward, we need you to upload your required KYC and vehicle documents. Please open the CAN-RIDE Driver App to complete this step.</p>
  `, assetBaseUrl);

  return { subject: 'CAN-RIDE: Application Received', html };
}
