import { Test } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  it('hashes and verifies with argon2id', async () => {
    const svc = new PasswordService();
    const hash = await svc.hash('password123');
    expect(hash).not.toEqual('password123');
    expect(await svc.verify(hash, 'password123')).toBe(true);
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });
});
