import { DriverApprovalStatus, UserRole } from '@prisma/client';

describe('Dual-role account authentication logic', () => {
  function assertMobileAppRole(userRole: UserRole, requestedRole?: UserRole) {
    if (!requestedRole || userRole === requestedRole) {
      return;
    }
    if (
      (userRole === UserRole.PASSENGER || userRole === UserRole.DRIVER) &&
      (requestedRole === UserRole.PASSENGER || requestedRole === UserRole.DRIVER)
    ) {
      return;
    }
    throw new Error('This account cannot sign in to this app.');
  }

  function parseSessionRoleFromFamilyId(familyId: string, fallbackRole: UserRole): UserRole {
    if (familyId.startsWith('DRIVER:')) {
      return UserRole.DRIVER;
    } else if (familyId.startsWith('PASSENGER:')) {
      return UserRole.PASSENGER;
    } else if (familyId.startsWith('ADMIN:')) {
      return UserRole.ADMIN;
    } else if (familyId.startsWith('SUPER_ADMIN:')) {
      return UserRole.SUPER_ADMIN;
    }
    return fallbackRole;
  }

  it('allows PASSENGER user to sign into DRIVER app without exception', () => {
    expect(() => {
      assertMobileAppRole(UserRole.PASSENGER, UserRole.DRIVER);
    }).not.toThrow();
  });

  it('allows DRIVER user to sign into PASSENGER app without exception', () => {
    expect(() => {
      assertMobileAppRole(UserRole.DRIVER, UserRole.PASSENGER);
    }).not.toThrow();
  });

  it('allows same-role sign ins without exception', () => {
    expect(() => {
      assertMobileAppRole(UserRole.PASSENGER, UserRole.PASSENGER);
    }).not.toThrow();
    expect(() => {
      assertMobileAppRole(UserRole.DRIVER, UserRole.DRIVER);
    }).not.toThrow();
  });

  it('rejects ADMIN user from signing into mobile apps without mobile role', () => {
    expect(() => {
      assertMobileAppRole(UserRole.ADMIN, UserRole.PASSENGER);
    }).toThrow('This account cannot sign in to this app.');
    expect(() => {
      assertMobileAppRole(UserRole.SUPER_ADMIN, UserRole.DRIVER);
    }).toThrow('This account cannot sign in to this app.');
  });

  it('preserves DRIVER role across refresh token rotation via familyId prefix', () => {
    const familyId = `DRIVER:test-uuid-1234`;
    const resolvedRole = parseSessionRoleFromFamilyId(familyId, UserRole.PASSENGER);
    expect(resolvedRole).toBe(UserRole.DRIVER);
  });

  it('preserves PASSENGER role across refresh token rotation via familyId prefix', () => {
    const familyId = `PASSENGER:test-uuid-5678`;
    const resolvedRole = parseSessionRoleFromFamilyId(familyId, UserRole.DRIVER);
    expect(resolvedRole).toBe(UserRole.PASSENGER);
  });

  it('falls back to database role if refresh token has legacy familyId format without prefix', () => {
    const familyId = `plain-legacy-uuid`;
    const resolvedRole = parseSessionRoleFromFamilyId(familyId, UserRole.PASSENGER);
    expect(resolvedRole).toBe(UserRole.PASSENGER);
  });
});
