import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface SendTemplateOptions {
  eventId?: string;
  userId?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const host = this.configService.get<string>('email.smtpHost');
    const port = this.configService.get<number>('email.smtpPort') ?? 465;
    const secure = port === 465; // SSL/TLS
    const user = this.configService.get<string>('email.smtpUser');
    const pass = this.configService.get<string>('email.smtpPass');

    if (!pass && this.configService.get<string>('nodeEnv') !== 'production') {
      this.logger.warn('SMTP_PASS is not set. Using JSON transport (logs emails).');
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    } else {
      this.transporter = nodemailer.createTransport({
        pool: true,
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
    }
  }

  async sendTemplate(
    templateId: string,
    to: string,
    subject: string,
    html: string,
    opts?: SendTemplateOptions,
  ): Promise<void> {
    if (!this.configService.get<boolean>('email.enabled')) {
      return;
    }
    if (!to || to.endsWith('@anonymized.invalid')) {
      this.logger.debug(`Skipping email to ${to}`);
      return;
    }

    if (opts?.eventId) {
      const prior = await this.prisma.notificationDelivery.findFirst({
        where: {
          channel: 'email',
          templateKey: templateId,
          dataJson: { path: ['eventId'], equals: opts.eventId },
        },
      });
      if (prior && prior.status === 'sent') {
        this.logger.debug(`Email ${templateId} for event ${opts.eventId} already sent.`);
        return;
      }
    }

    const from = this.configService.get<string>('email.fromAddress');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      let info;
      let attempt = 0;
      while (attempt < 3) {
        try {
          info = await this.transporter.sendMail({
            from,
            to,
            subject,
            html,
            text,
          });
          break;
        } catch (error) {
          attempt++;
          if (attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      this.logger.log(`Email sent successfully to ${to} (Message ID: ${info?.messageId})`);
      
      if (opts?.eventId) {
        await this.prisma.notificationDelivery.create({
          data: {
            channel: 'email',
            templateKey: templateId,
            userId: opts.userId,
            status: 'sent',
            dataJson: { eventId: opts.eventId },
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
      if (opts?.eventId) {
        try {
          await this.prisma.notificationDelivery.create({
            data: {
              channel: 'email',
              templateKey: templateId,
              userId: opts.userId,
              status: 'failed',
              errorCode: error.message?.slice(0, 255),
              dataJson: { eventId: opts.eventId },
            },
          });
        } catch (dbErr) {
          this.logger.error(`Failed to record email failure for ${opts.eventId}`, dbErr.stack);
        }
      }
    }
  }

  async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    await this.sendTemplate('raw', to, subject, htmlBody);
  }
}
