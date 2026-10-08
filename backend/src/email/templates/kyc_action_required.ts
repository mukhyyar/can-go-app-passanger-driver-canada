import { layout, escapeHtml } from './layout';

export interface KycActionRequiredVars {
  driverName: string;
  documentLabel: string;
  reason: string;
}

export function renderKycActionRequired(vars: KycActionRequiredVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const doc = escapeHtml(vars.documentLabel);
  const reason = escapeHtml(vars.reason);
  const html = layout(`
    <h2 style="margin-top:0;">Action Required ⚠️</h2>
    <p>Hi ${name},</p>
    <p>There's an issue with one of your documents that needs your attention before you can go online.</p>
    <div class="alert-box">
      <p style="margin-top:0;"><strong>Document:</strong> ${doc}</p>
      <p style="margin-bottom:0;"><strong>Reason:</strong> ${reason}</p>
    </div>
  `, assetBaseUrl);

  return { subject: 'CAN-RIDE: Action Required on Your Document', html };
}
