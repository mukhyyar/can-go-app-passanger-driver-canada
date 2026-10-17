import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface SendTemplateOptions {
  eventId?: string;
  userId?: string;
}

type MailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly transport: 'relay' | 'resend' | 'smtp';

  private readonly inFlightEventIds = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const relayUrl = this.configService.get<string>('email.relayUrl');
    const relayKey = this.configService.get<string>('email.relayKey');
    const resendKey = this.configService.get<string>('email.resendApiKey');

    if (relayUrl && relayKey) {
      this.transport = 'relay';
      this.logger.log(`Email transport: HTTP relay (${relayUrl})`);
      return;
    }

    if (resendKey) {
      this.transport = 'resend';
      this.logger.log('Email transport: Resend HTTP API');
      return;
    }

    this.transport = 'smtp';
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
      this.logger.log(`Email transport: SMTP ${host}:${port}`);
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
      if (this.inFlightEventIds.has(opts.eventId)) {
        this.logger.debug(
          `Email ${templateId} for event ${opts.eventId} is currently in-flight. Skipping duplicate.`,
        );
        return;
      }
      this.inFlightEventIds.add(opts.eventId);

      try {
        const prior = await this.prisma.notificationDelivery.findFirst({
          where: {
            channel: 'email',
            templateKey: templateId,
            OR: [
              { providerMsgId: opts.eventId },
              { dataJson: { path: ['eventId'], equals: opts.eventId } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (prior) {
          if (prior.status === 'sent') {
            this.logger.debug(
              `Email ${templateId} for event ${opts.eventId} already sent.`,
            );
            return;
          }
          // If failed recently (< 15 minutes ago), enforce cooldown to prevent tight retry loops
          const ageMs = Date.now() - new Date(prior.createdAt).getTime();
          if (ageMs < 15 * 60 * 1000) {
            this.logger.warn(
              `Email ${templateId} for event ${opts.eventId} failed ${Math.round(ageMs / 1000)}s ago. Cooldown active, skipping retry.`,
            );
            return;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed checking prior delivery for ${opts.eventId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const from = this.configService.get<string>('email.fromAddress');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      let messageId: string | undefined;
      let attempt = 0;
      while (attempt < 3) {
        try {
          const payload: MailPayload = {
            from: from!,
            to,
            subject,
            html,
            text,
          };
          if (this.transport === 'relay') {
            messageId = await this.sendViaRelay(payload);
          } else if (this.transport === 'resend') {
            messageId = await this.sendViaResend(payload);
          } else {
            const info = await this.transporter!.sendMail(payload);
            messageId = info?.messageId;
          }
          break;
        } catch (error) {
          attempt++;
          if (attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      this.logger.log(`Email sent successfully to ${to} (Message ID: ${messageId})`);

      if (opts?.eventId) {
        try {
          await this.prisma.notificationDelivery.create({
            data: {
              channel: 'email',
              templateKey: templateId,
              userId: opts.userId,
              provider: this.transport,
              providerMsgId: opts.eventId,
              status: 'sent',
              dataJson: { eventId: opts.eventId },
            },
          });
        } catch (dbErr) {
          this.logger.error(
            `Failed to record email delivery for ${opts.eventId}: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
          );
          // If foreign key constraint on userId failed, persist delivery record without userId
          if (opts.userId) {
            try {
              await this.prisma.notificationDelivery.create({
                data: {
                  channel: 'email',
                  templateKey: templateId,
                  provider: this.transport,
                  providerMsgId: opts.eventId,
                  status: 'sent',
                  dataJson: { eventId: opts.eventId, failedUserId: opts.userId },
                },
              });
            } catch (fallbackErr) {
              this.logger.error(
                `Failed fallback delivery record for ${opts.eventId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
              );
            }
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send email to ${to}: ${err.message}`, err.stack);
      if (opts?.eventId) {
        try {
          await this.prisma.notificationDelivery.create({
            data: {
              channel: 'email',
              templateKey: templateId,
              userId: opts.userId,
              provider: this.transport,
              providerMsgId: opts.eventId,
              status: 'failed',
              errorCode: err.message?.slice(0, 255),
              dataJson: { eventId: opts.eventId },
            },
          });
        } catch (dbErr) {
          if (opts.userId) {
            try {
              await this.prisma.notificationDelivery.create({
                data: {
                  channel: 'email',
                  templateKey: templateId,
                  provider: this.transport,
                  providerMsgId: opts.eventId,
                  status: 'failed',
                  errorCode: err.message?.slice(0, 255),
                  dataJson: { eventId: opts.eventId, failedUserId: opts.userId },
                },
              });
            } catch (fallbackErr) {
              this.logger.error(
                `Failed fallback failure record for ${opts.eventId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
              );
            }
          } else {
            this.logger.error(
              `Failed to record email failure for ${opts.eventId}`,
              (dbErr as Error).stack,
            );
          }
        }
      }
    } finally {
      if (opts?.eventId) {
        this.inFlightEventIds.delete(opts.eventId);
      }
    }
  }

  async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    await this.sendTemplate('raw', to, subject, htmlBody);
  }

  private async sendViaRelay(payload: MailPayload): Promise<string> {
    const url = this.configService.get<string>('email.relayUrl');
    const key = this.configService.get<string>('email.relayKey');
    if (!url || !key) {
      throw new Error('EMAIL_RELAY_URL / EMAIL_RELAY_KEY not set');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mail-Relay-Key': key,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
      detail?: string;
    };

    if (!res.ok || body.ok === false) {
      throw new Error(
        body.detail || body.error || `Mail relay HTTP ${res.status}`,
      );
    }

    return body.id ?? 'relay';
  }

  private async sendViaResend(payload: MailPayload): Promise<string> {
    const apiKey = this.configService.get<string>('email.resendApiKey');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      throw new Error(body.message || body.name || `Resend HTTP ${res.status}`);
    }

    return body.id ?? 'resend';
  }
}
