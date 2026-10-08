import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { renderAppReceived } from './templates/app_received';
import { renderKycUnderReview } from './templates/kyc_under_review';
import { renderKycActionRequired } from './templates/kyc_action_required';
import { renderKycApproved } from './templates/kyc_approved';
import { renderAccountSuspended } from './templates/account_suspended';
import { renderAdminNewDriver } from './templates/admin_new_driver';
import { renderWalletPayoutRequested } from './templates/wallet_payout_requested';
import { renderWalletPayoutFailed } from './templates/wallet_payout_failed';
import { renderAdminLargeWithdrawal } from './templates/admin_large_withdrawal';
import { renderRideScheduled } from './templates/ride_scheduled';
import { renderRideReceipt } from './templates/ride_receipt';
import { renderRideCancelled } from './templates/ride_cancelled';
import { renderSupportReceived } from './templates/support_received';
import { renderAdminCriticalIssue } from './templates/admin_critical_issue';

@Injectable()
export class EmailEventsService {
  private readonly logger = new Logger(EmailEventsService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get assetBaseUrl() {
    return this.configService.get<string>('email.assetBaseUrl') ?? 'https://can-rides.ca/assets';
  }

  private get adminWebBaseUrl() {
    return this.configService.get<string>('admin.adminWebBase') ?? 'https://admin.can-rides.ca';
  }

  private async getAdminAlertEmails(): Promise<string[]> {
    const fromEnv = this.configService.get<string[]>('admin.alertEmails') || [];
    if (fromEnv.length > 0) return fromEnv;

    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { email: true },
    });
    return superAdmins.map((u) => u.email).filter(Boolean) as string[];
  }

  async sendDriverAppReceived(userId: string, driverName: string, email: string) {
    const { subject, html } = renderAppReceived({ driverName }, this.assetBaseUrl);
    await this.emailService.sendTemplate('app_received', email, subject, html, {
      userId,
      eventId: `app_received.${userId}`,
    });
  }

  async sendKycUnderReview(userId: string, driverName: string, email: string) {
    const { subject, html } = renderKycUnderReview({ driverName }, this.assetBaseUrl);
    await this.emailService.sendTemplate('kyc_under_review', email, subject, html, {
      userId,
      eventId: `kyc_under_review.${userId}`,
    });
  }

  async sendKycActionRequired(
    userId: string,
    driverName: string,
    email: string,
    documentLabel: string,
    reason: string,
  ) {
    const { subject, html } = renderKycActionRequired(
      { driverName, documentLabel, reason },
      this.assetBaseUrl,
    );
    await this.emailService.sendTemplate('kyc_action_required', email, subject, html, { userId });
  }

  async sendKycApproved(userId: string, driverName: string, email: string) {
    const { subject, html } = renderKycApproved({ driverName }, this.assetBaseUrl);
    await this.emailService.sendTemplate('kyc_approved', email, subject, html, {
      userId,
      eventId: `kyc_approved.${userId}`,
    });
  }

  async sendAccountSuspended(userId: string, driverName: string, email: string, reason: string) {
    const { subject, html } = renderAccountSuspended({ driverName, reason }, this.assetBaseUrl);
    await this.emailService.sendTemplate('account_suspended', email, subject, html, { userId });
  }

  async sendAdminNewDriverAlert(userId: string, driverName: string, driverEmail: string) {
    const emails = await this.getAdminAlertEmails();
    const { subject, html } = renderAdminNewDriver(
      { driverName, email: driverEmail, adminWebBaseUrl: this.adminWebBaseUrl },
      this.assetBaseUrl,
    );

    for (const adminEmail of emails) {
      if (!adminEmail) continue;
      await this.emailService.sendTemplate('admin_new_driver', adminEmail, subject, html, {
        eventId: `admin_new_driver.${userId}.${adminEmail}`,
      });
    }
  }
  async sendWalletPayoutRequested(userId: string, driverName: string, email: string, amount: string, currency: string, accountMask: string) {
    const { subject, html } = renderWalletPayoutRequested({ driverName, amount, currency, accountMask }, this.assetBaseUrl);
    await this.emailService.sendTemplate('wallet_payout_requested', email, subject, html, { userId });
  }

  async sendWalletPayoutFailed(userId: string, driverName: string, email: string, amount: string, currency: string) {
    const { subject, html } = renderWalletPayoutFailed({ driverName, amount, currency }, this.assetBaseUrl);
    await this.emailService.sendTemplate('wallet_payout_failed', email, subject, html, { userId });
  }

  async sendAdminLargeWithdrawalAlert(userId: string, driverName: string, driverEmail: string, amount: string, currency: string) {
    const emails = await this.getAdminAlertEmails();
    const { subject, html } = renderAdminLargeWithdrawal(
      { driverName, driverEmail, amount, currency, adminWebBaseUrl: this.adminWebBaseUrl, userId },
      this.assetBaseUrl,
    );

    for (const adminEmail of emails) {
      if (!adminEmail) continue;
      await this.emailService.sendTemplate('admin_large_withdrawal', adminEmail, subject, html, {
        eventId: `admin_large_withdrawal.${userId}.${adminEmail}`,
      });
    }
  }

  async sendRideScheduled(userId: string, email: string, rideCode: string, pickupAt: string, fromLabel: string, toLabel: string, fare: string) {
    const { subject, html } = renderRideScheduled({ rideCode, pickupAt, fromLabel, toLabel, fare }, this.assetBaseUrl);
    await this.emailService.sendTemplate('ride_scheduled', email, subject, html, { userId });
  }

  async sendRideReceipt(userId: string, email: string, rideCode: string, driverName: string, fare: string, fee: string, tip: string, total: string) {
    const { subject, html } = renderRideReceipt({ rideCode, driverName, fare, fee, tip, total }, this.assetBaseUrl);
    await this.emailService.sendTemplate('ride_receipt', email, subject, html, { userId });
  }

  async sendRideCancelled(userId: string, email: string, rideCode: string, cancelledBy: string, fee: string, gracePeriodMinutes: number) {
    const { subject, html } = renderRideCancelled({ rideCode, cancelledBy, fee, gracePeriodMinutes }, this.assetBaseUrl);
    await this.emailService.sendTemplate('ride_cancelled', email, subject, html, { userId });
  }

  async sendSupportReceived(userId: string, email: string, ticketId: string, userName: string) {
    const { subject, html } = renderSupportReceived({ ticketId, userName }, this.assetBaseUrl);
    await this.emailService.sendTemplate('support_received', email, subject, html, { userId });
  }

  async sendAdminCriticalIssueAlert(rideId: string, rideCode: string, reporterName: string, reporterRole: string, category: string) {
    const emails = await this.getAdminAlertEmails();
    const { subject, html } = renderAdminCriticalIssue(
      { reporterName, reporterRole, rideCode, category, adminWebBaseUrl: this.adminWebBaseUrl, rideId },
      this.assetBaseUrl,
    );

    for (const adminEmail of emails) {
      if (!adminEmail) continue;
      await this.emailService.sendTemplate('admin_critical_issue', adminEmail, subject, html, {
        eventId: `admin_critical_issue.${rideId}.${adminEmail}`,
      });
    }
  }
}
