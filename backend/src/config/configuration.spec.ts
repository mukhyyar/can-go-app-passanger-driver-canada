import configuration from './configuration';

describe('configuration.trustProxy', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to 1 hop (nginx) in production so req.ip is the real client IP', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TRUST_PROXY;
    expect(configuration().trustProxy).toBe(1);
  });

  it('is disabled for local development', () => {
    process.env.NODE_ENV = 'local';
    delete process.env.TRUST_PROXY;
    expect(configuration().trustProxy).toBe(false);
  });

  it('honours explicit TRUST_PROXY overrides', () => {
    process.env.NODE_ENV = 'production';
    process.env.TRUST_PROXY = '2';
    expect(configuration().trustProxy).toBe(2);
    process.env.TRUST_PROXY = 'false';
    expect(configuration().trustProxy).toBe(false);
    process.env.TRUST_PROXY = '';
    expect(configuration().trustProxy).toBe(1);
  });
});
