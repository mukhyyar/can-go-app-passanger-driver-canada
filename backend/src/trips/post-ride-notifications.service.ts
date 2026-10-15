import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RideStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailEventsService } from '../email/email-events.service';
import { SMS_PROVIDER } from '../providers/sms/sms-provider.interface';
import type { SmsProvider } from '../providers/sms/sms-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import {
  RideInvoiceData,
  renderPrintableInvoiceHtml,
} from '../email/templates/ride_invoice';

@Injectable()
export class PostRideNotificationService {
  private readonly logger = new Logger(PostRideNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly emailEvents?: EmailEventsService,
    @Optional() @Inject(SMS_PROVIDER) private readonly sms?: SmsProvider,
  ) {}

  private get passengerWebBase(): string {
    return (
      this.config.get<string>('admin.passengerWebBase') ||
      'https://can-rides.ca'
    );
  }

  private get appDeeplinkBase(): string {
    return (
      this.config.get<string>('email.appDeeplinkBaseUrl') ||
      'canride://'
    );
  }

  private get tipReminderDelayMinutes(): number {
    return (
      this.config.get<number>('postRide.tipReminderDelayMinutes') ?? 60
    );
  }

  /**
   * Main entry point called when a ride transitions to RideStatus.COMPLETED.
   * Completely isolated and non-blocking: errors are logged and never throw.
   */
  async handleRideCompleted(rideId: string): Promise<void> {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          passenger: { include: { user: true } },
          selectedOffer: {
            include: {
              driver: { include: { user: true } },
              vehicle: true,
            },
          },
          financial: true,
          payments: {
            where: { status: 'succeeded' },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!ride) {
        this.logger.warn(`Cannot process post-ride notifications: Ride ${rideId} not found`);
        return;
      }

      if (ride.status !== RideStatus.COMPLETED) {
        this.logger.debug(
          `Skipping post-ride notifications: Ride ${rideId} status is ${ride.status}`,
        );
        return;
      }

      const passengerUser = ride.passenger?.user;
      if (!passengerUser || passengerUser.isSuspended || passengerUser.archivedAt) {
        this.logger.debug(
          `Skipping post-ride notifications: Passenger user inactive or not found for ride ${rideId}`,
        );
        return;
      }

      // Step 1: Send review & recommendation request via Email and SMS
      await this.sendReviewAndRecommendation(ride);

      // Step 2: Send finalized ride invoice via Email
      await this.sendFinalizedInvoice(ride);
    } catch (err) {
      this.logger.error(
        `Unexpected error in post-ride notifications for ride ${rideId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Requirement 1: Post-Ride Review and Recommendation (Email + SMS).
   * Verifies the passenger has not already submitted a review and deduplicates.
   */
  private async sendReviewAndRecommendation(ride: any): Promise<void> {
    const rideId = ride.id;
    const passengerUser = ride.passenger?.user;
    if (!passengerUser) return;

    // Check if passenger already submitted a rating/review for this ride
    const existingRating = await this.prisma.rating.findUnique({
      where: {
        rideId_fromUserId: {
          rideId,
          fromUserId: passengerUser.id,
        },
      },
    });

    if (existingRating) {
      this.logger.debug(
        `Passenger ${passengerUser.id} already submitted a review for ride ${rideId}. Skipping review request.`,
      );
      return;
    }

    const rideCode = ride.id.slice(0, 8).toUpperCase();
    const driverName =
      ride.selectedOffer?.driver?.fullName || 'Your CAN-RIDE Driver';
    const passengerName =
      ride.passenger?.fullName || passengerUser.phoneE164 || 'Passenger';
    const reviewUrl = `${this.passengerWebBase}/rides/${ride.id}`;

    // 1. Send Review Email
    if (passengerUser.email && this.emailEvents) {
      try {
        const eventId = `post_ride_review_email_${rideId}`;
        const alreadySent = await this.prisma.notificationDelivery.findFirst({
          where: {
            channel: 'email',
            templateKey: 'post_ride_review',
            dataJson: { path: ['eventId'], equals: eventId },
            status: 'sent',
          },
        });

        if (!alreadySent) {
          await this.emailEvents.sendPostRideReview(passengerUser.id, passengerUser.email, {
            rideId,
            rideCode,
            passengerName,
            driverName,
            fromLabel: ride.fromLabel,
            toLabel: ride.toLabel || 'Destination',
            reviewUrl,
          });
          this.logger.log(`Post-ride review email sent to ${passengerUser.email} for ride ${rideId}`);
        } else {
          this.logger.debug(`Post-ride review email already sent for ride ${rideId}`);
        }
      } catch (emailErr) {
        this.logger.error(
          `Failed to send post-ride review email for ride ${rideId}: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`,
        );
      }
    }

    // 2. Send Review SMS
    if (passengerUser.phoneE164 && this.sms) {
      const smsEventId = `post_ride_review_sms_${rideId}`;
      try {
        const alreadySentSms = await this.prisma.notificationDelivery.findFirst({
          where: {
            channel: 'sms',
            templateKey: 'post_ride_review_sms',
            dataJson: { path: ['eventId'], equals: smsEventId },
            status: 'sent',
          },
        });

        if (!alreadySentSms) {
          const smsBody = `Thank you for riding with CAN-RIDE! We hope you enjoyed your journey with ${driverName}. How was your experience? Would you choose CAN-RIDE again? Rate your ride and share feedback: ${reviewUrl}. Please recommend CAN-RIDE to friends & family!`;

          const result = await this.sms.sendSms(passengerUser.phoneE164, smsBody);

          await this.notifications.logDelivery({
            userId: passengerUser.id,
            channel: 'sms',
            templateKey: 'post_ride_review_sms',
            title: 'Post-Ride Review',
            body: smsBody,
            status: 'sent',
            providerMsgId: result?.providerMessageId,
            dataJson: { eventId: smsEventId, rideId },
          });

          this.logger.log(
            `Post-ride review SMS sent to ${passengerUser.phoneE164} for ride ${rideId}`,
          );
        } else {
          this.logger.debug(`Post-ride review SMS already sent for ride ${rideId}`);
        }
      } catch (smsErr) {
        this.logger.error(
          `Failed to send post-ride review SMS for ride ${rideId}: ${smsErr instanceof Error ? smsErr.message : String(smsErr)}`,
        );

        await this.notifications.logDelivery({
          userId: passengerUser.id,
          channel: 'sms',
          templateKey: 'post_ride_review_sms',
          title: 'Post-Ride Review',
          status: 'failed',
          errorCode: smsErr instanceof Error ? smsErr.message.slice(0, 255) : 'UNKNOWN_SMS_ERROR',
          dataJson: { eventId: smsEventId, rideId },
        });
      }
    }
  }

  /**
   * Requirement 2: Automated Ride Invoice (Email).
   * Sourced directly from actual finalized transaction in RideFinancial and Payment.
   */
  async sendFinalizedInvoice(ride: any): Promise<void> {
    const rideId = ride.id;
    const passengerUser = ride.passenger?.user;
    if (!passengerUser || !passengerUser.email || !this.emailEvents) return;

    const financial =
      ride.financial ??
      (await this.prisma.rideFinancial.findUnique({ where: { rideId } }));

    if (!financial) {
      this.logger.warn(
        `Cannot send invoice for ride ${rideId}: RideFinancial record not found`,
      );
      return;
    }

    const succeededPayment =
      ride.payments?.[0] ??
      (await this.prisma.payment.findFirst({
        where: { rideId, status: 'succeeded' },
        orderBy: { createdAt: 'desc' },
      }));

    // Succeeded payment verification
    if (!succeededPayment && Number(financial.passengerTotalCharged) > 0) {
      this.logger.warn(
        `Payment not yet finalized for ride ${rideId}. Postponing invoice delivery.`,
      );
      return;
    }

    const invoiceEventId = `ride_invoice_email_${rideId}`;
    const alreadySent = await this.prisma.notificationDelivery.findFirst({
      where: {
        channel: 'email',
        templateKey: 'ride_invoice',
        dataJson: { path: ['eventId'], equals: invoiceEventId },
        status: 'sent',
      },
    });

    if (alreadySent) {
      this.logger.debug(`Ride invoice email already sent for ride ${rideId}`);
      return;
    }

    const rideCode = ride.id.slice(0, 8).toUpperCase();
    const driver = ride.selectedOffer?.driver;
    const vehicle = ride.selectedOffer?.vehicle;
    const driverName = driver?.fullName || 'CAN-RIDE Driver';
    const passengerName =
      ride.passenger?.fullName || passengerUser.phoneE164 || 'Valued Passenger';

    const completedAtDate = ride.updatedAt || new Date();
    const completedAtFormatted = new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Toronto',
    }).format(new Date(completedAtDate));

    const invoiceUrl = `${this.passengerWebBase}/rides/${ride.id}/invoice`;

    const invoiceData: RideInvoiceData = {
      rideId,
      rideCode,
      passengerName,
      passengerEmail: passengerUser.email,
      passengerPhone: passengerUser.phoneE164 || undefined,
      driverName,
      vehicleName: vehicle?.name || undefined,
      vehiclePlate: vehicle?.plate || undefined,
      vehicleClass: vehicle?.vehicleClass || undefined,
      vehicleColor: vehicle?.color || undefined,
      vehicleYear: vehicle?.year || undefined,
      fromLabel: ride.fromLabel,
      toLabel: ride.toLabel || 'Destination',
      completedAtFormatted,
      currency: (financial.currency || 'CAD').toUpperCase(),
      rideFare: Number(financial.rideFare).toFixed(2),
      marketplaceFee: Number(financial.marketplaceFee).toFixed(2),
      taxes: financial.taxes ? Number(financial.taxes).toFixed(2) : '0.00',
      tipAmount: financial.tipAmount ? Number(financial.tipAmount).toFixed(2) : '0.00',
      totalCharged: Number(financial.passengerTotalCharged).toFixed(2),
      paymentMethod: succeededPayment?.paymentMethod || 'Credit Card (Stripe)',
      paymentStatus: (succeededPayment?.status || 'PAID').toUpperCase(),
      transactionRef: succeededPayment?.providerRef || undefined,
      invoiceUrl,
    };

    try {
      await this.emailEvents.sendRideInvoice(
        passengerUser.id,
        passengerUser.email,
        invoiceData,
      );
      this.logger.log(`Ride invoice email sent to ${passengerUser.email} for ride ${rideId}`);
    } catch (invoiceErr) {
      this.logger.error(
        `Failed to send invoice email for ride ${rideId}: ${invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr)}`,
      );
    }
  }

  /**
   * Requirement 3: Email Reminder to Tip the Driver.
   * Sends if ride is completed, untipped, not cancelled, and not already reminded.
   */
  async sendTippingReminderIfEligible(rideId: string): Promise<boolean> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: { include: { user: true } },
        selectedOffer: { include: { driver: true } },
        financial: true,
      },
    });

    if (!ride) return false;

    // Must be COMPLETED (never cancelled, expired, or in-progress)
    if (ride.status !== RideStatus.COMPLETED) return false;

    const passengerUser = ride.passenger?.user;
    if (!passengerUser || !passengerUser.email || !this.emailEvents) return false;

    // Check if passenger already tipped
    const financial = ride.financial;
    const hasTippedInFinancial =
      financial?.tipAmount && Number(financial.tipAmount) > 0;
    if (hasTippedInFinancial) return false;

    const tipPayment = await this.prisma.payment.findFirst({
      where: {
        rideId,
        status: 'succeeded',
        metaJson: { path: ['type'], equals: 'TIP' },
      },
    });
    if (tipPayment) return false;

    // Check if tipping reminder was already sent
    const tipReminderEventId = `ride_tip_reminder_email_${rideId}`;
    const alreadySent = await this.prisma.notificationDelivery.findFirst({
      where: {
        channel: 'email',
        templateKey: 'ride_tip_reminder',
        dataJson: { path: ['eventId'], equals: tipReminderEventId },
        status: 'sent',
      },
    });
    if (alreadySent) return false;

    const rideCode = ride.id.slice(0, 8).toUpperCase();
    const driverName =
      ride.selectedOffer?.driver?.fullName || 'Your Driver';
    const passengerName =
      ride.passenger?.fullName || passengerUser.phoneE164 || 'Passenger';
    const tipUrl = `${this.passengerWebBase}/rides/${ride.id}?action=tip`;

    try {
      await this.emailEvents.sendRideTipReminder(
        passengerUser.id,
        passengerUser.email,
        {
          rideId,
          rideCode,
          passengerName,
          driverName,
          tipUrl,
        },
      );
      this.logger.log(`Tipping reminder email sent to ${passengerUser.email} for ride ${rideId}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send tipping reminder email for ride ${rideId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Sweeps completed rides within the tipping reminder window (e.g. 60 min to 24 hr ago).
   */
  async processDueTippingReminders(): Promise<{ sent: number; skipped: number }> {
    const delayMinutes = this.tipReminderDelayMinutes;
    const delayCutoff = new Date(Date.now() - delayMinutes * 60 * 1000);
    const maxLookback = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours lookback

    const candidates = await this.prisma.ride.findMany({
      where: {
        status: RideStatus.COMPLETED,
        updatedAt: {
          lte: delayCutoff,
          gte: maxLookback,
        },
      },
      select: { id: true },
      take: 50,
    });

    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      const res = await this.sendTippingReminderIfEligible(c.id);
      if (res) sent++;
      else skipped++;
    }

    return { sent, skipped };
  }

  /**
   * Generates printable HTML invoice for authenticated passenger or admin viewing.
   */
  async getPrintableInvoiceHtml(
    actorUserId: string,
    rideId: string,
    role?: UserRole,
  ): Promise<string> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: { include: { user: true } },
        selectedOffer: {
          include: {
            driver: true,
            vehicle: true,
          },
        },
        financial: true,
        payments: {
          where: { status: 'succeeded' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ride) throw new NotFoundException('Ride not found');

    const isPassenger = ride.passenger?.userId === actorUserId;
    const isAdmin =
      role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

    if (!isPassenger && !isAdmin) {
      throw new ForbiddenException('You do not have permission to view this invoice');
    }

    const passengerUser = ride.passenger?.user;
    const financial = ride.financial;
    const succeededPayment = ride.payments?.[0];
    const rideCode = ride.id.slice(0, 8).toUpperCase();
    const driver = ride.selectedOffer?.driver;
    const vehicle = ride.selectedOffer?.vehicle;

    const completedAtFormatted = new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Toronto',
    }).format(new Date(ride.updatedAt));

    const invoiceData: RideInvoiceData = {
      rideId,
      rideCode,
      passengerName: ride.passenger?.fullName || passengerUser?.phoneE164 || 'Passenger',
      passengerEmail: passengerUser?.email || '',
      passengerPhone: passengerUser?.phoneE164 || undefined,
      driverName: driver?.fullName || 'CAN-RIDE Driver',
      vehicleName: vehicle?.name || undefined,
      vehiclePlate: vehicle?.plate || undefined,
      vehicleClass: vehicle?.vehicleClass || undefined,
      vehicleColor: vehicle?.color || undefined,
      vehicleYear: vehicle?.year || undefined,
      fromLabel: ride.fromLabel,
      toLabel: ride.toLabel || 'Destination',
      completedAtFormatted,
      currency: (financial?.currency || 'CAD').toUpperCase(),
      rideFare: financial ? Number(financial.rideFare).toFixed(2) : '0.00',
      marketplaceFee: financial ? Number(financial.marketplaceFee).toFixed(2) : '0.00',
      taxes: financial?.taxes ? Number(financial.taxes).toFixed(2) : '0.00',
      tipAmount: financial?.tipAmount ? Number(financial.tipAmount).toFixed(2) : '0.00',
      totalCharged: financial ? Number(financial.passengerTotalCharged).toFixed(2) : '0.00',
      paymentMethod: succeededPayment?.paymentMethod || 'Credit Card (Stripe)',
      paymentStatus: (succeededPayment?.status || 'PAID').toUpperCase(),
      transactionRef: succeededPayment?.providerRef || undefined,
    };

    const assetBaseUrl =
      this.config.get<string>('email.assetBaseUrl') ||
      'https://can-rides.ca/assets';

    return renderPrintableInvoiceHtml(invoiceData, assetBaseUrl);
  }
}
