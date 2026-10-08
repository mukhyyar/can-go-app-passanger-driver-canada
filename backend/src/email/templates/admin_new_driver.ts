import { layout, escapeHtml } from './layout';

export interface AdminNewDriverVars {
  driverName: string;
  email: string;
  adminWebBaseUrl: string;
}

export function renderAdminNewDriver(vars: AdminNewDriverVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const email = escapeHtml(vars.email);
  const html = layout(`
    <h2 style="margin-top:0;">New Driver Review Required</h2>
    <p>Hello Admin,</p>
    <p>A new driver has submitted all required KYC documents and is waiting for approval.</p>
    <div class="value-box" style="text-align: left;">
      <p><strong>Driver:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
    </div>
    <div style="text-align: center;">
      <a href="${vars.adminWebBaseUrl}" class="btn" style="background:#111827;">Review Application</a>
    </div>
  `, assetBaseUrl);

  return { subject: 'Action Required: New Driver Application', html };
}
