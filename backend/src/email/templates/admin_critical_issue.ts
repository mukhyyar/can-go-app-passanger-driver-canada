import { layout } from './layout';
import { escapeHtml } from './layout';

interface AdminCriticalIssueData {
  reporterName: string;
  reporterRole: string;
  rideCode: string;
  category: string;
  adminWebBaseUrl: string;
  rideId: string;
}

export function renderAdminCriticalIssue(
  data: AdminCriticalIssueData,
  assetBaseUrl: string,
) {
  const name = escapeHtml(data.reporterName);
  const role = escapeHtml(data.reporterRole);
  const code = escapeHtml(data.rideCode);
  const category = escapeHtml(data.category);
  const adminUrl = escapeHtml(`${data.adminWebBaseUrl}/rides/${data.rideId}`);
  
  const subject = `CRITICAL ISSUE REPORTED: Ride ${code}`;
  const html = layout(
    `
    <h2>Critical Safety Issue Reported</h2>
    <p>A safety issue was reported for ride <strong>${code}</strong>.</p>
    <ul>
      <li><strong>Reporter:</strong> ${name} (${role})</li>
      <li><strong>Category:</strong> ${category}</li>
    </ul>
    <br>
    <a href="${adminUrl}" class="btn">View Ride Details</a>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
