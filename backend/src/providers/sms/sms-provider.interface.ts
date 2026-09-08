export interface SmsProvider {
  readonly name: string;
  sendSms(
    toE164: string,
    body: string,
  ): Promise<{ providerMessageId: string }>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
