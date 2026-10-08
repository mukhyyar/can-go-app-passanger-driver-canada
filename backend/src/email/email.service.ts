import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('email.smtpHost');
    const port = this.configService.get<number>('email.smtpPort') ?? 465;
    const secure = port === 465; // SSL/TLS
    const user = this.configService.get<string>('email.smtpUser');
    const pass = this.configService.get<string>('email.smtpPass');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    const from = this.configService.get<string>('email.fromAddress');
    
    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html: htmlBody,
      });
      this.logger.log(`Email sent successfully to ${to} (Message ID: ${info.messageId})`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
