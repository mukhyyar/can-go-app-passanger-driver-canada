jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

import { TwilioSmsProvider } from './twilio-sms.provider';

describe('TwilioSmsProvider', () => {
  let provider: TwilioSmsProvider;
  let configMock: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'twilio.accountSid') return ' ACmock_account_sid_for_unit_tests ';
        if (key === 'twilio.authToken') return ' mock_auth_token_for_unit_tests ';
        if (key === 'twilio.fromNumber') return ' +1 555 743 4597 ';
        return undefined;
      }),
    };
    provider = new TwilioSmsProvider(configMock);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sanitizes credentials and phone numbers and sends SMS via Twilio API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SM1234567890abcdef' }),
    });
    global.fetch = fetchMock;

    const result = await provider.sendSms(' +1 604 555 0199 ', 'Test verification code');

    expect(result).toEqual({ providerMessageId: 'SM1234567890abcdef' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACmock_account_sid_for_unit_tests/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const bodyParams = options.body as URLSearchParams;
    expect(bodyParams.get('To')).toBe('+16045550199');
    expect(bodyParams.get('From')).toBe('+15557434597');
    expect(bodyParams.get('Body')).toBe('Test verification code');
  });

  it('sanitizes formatted phone numbers like +1 (604) 555-0199 properly', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SMformatted123' }),
    });
    global.fetch = fetchMock;

    const result = await provider.sendSms('+1 (604) 555-0199', 'Formatted number test');
    expect(result).toEqual({ providerMessageId: 'SMformatted123' });
    const [, options] = fetchMock.mock.calls[0];
    const bodyParams = options.body as URLSearchParams;
    expect(bodyParams.get('To')).toBe('+16045550199');
  });

  it('uses MessagingServiceSid when configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SMservice123' }),
    });
    global.fetch = fetchMock;

    const serviceConfigMock = {
      get: jest.fn((key: string) => {
        if (key === 'twilio.accountSid') return 'ACmock_sid';
        if (key === 'twilio.authToken') return 'mock_token';
        if (key === 'twilio.messagingServiceSid') return 'MGmock_service_sid';
        return undefined;
      }),
    };
    const serviceProvider = new TwilioSmsProvider(serviceConfigMock as any);
    const result = await serviceProvider.sendSms('+16045550199', 'Service test');

    expect(result).toEqual({ providerMessageId: 'SMservice123' });
    const [, options] = fetchMock.mock.calls[0];
    const bodyParams = options.body as URLSearchParams;
    expect(bodyParams.get('MessagingServiceSid')).toBe('MGmock_service_sid');
    expect(bodyParams.get('From')).toBeNull();
  });

  it('throws ServiceUnavailableException on Twilio API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: 'Invalid phone number' }),
    });

    await expect(
      provider.sendSms('+16045550199', 'Test verification code'),
    ).rejects.toThrow('Invalid phone number');
  });
});
