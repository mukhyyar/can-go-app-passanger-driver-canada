import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be E.164 (e.g. +14165551234)',
  })
  phoneE164!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class LoginDto {
  @ValidateIf((o: LoginDto) => !o.phoneE164)
  @IsEmail()
  email?: string;

  @ValidateIf((o: LoginDto) => !o.email)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  /** App requesting sign-in. When set, must match the account role. */
  @IsOptional()
  @IsIn([UserRole.PASSENGER, UserRole.DRIVER])
  role?: UserRole;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class OtpSendDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsIn(['register', 'login', 'verify_phone', 'password_reset'])
  purpose!: 'register' | 'login' | 'verify_phone' | 'password_reset';
}

export class OtpVerifyDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @MinLength(4)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  /** App requesting sign-in. When set, must match the account role. */
  @IsOptional()
  @IsIn([UserRole.PASSENGER, UserRole.DRIVER])
  role?: UserRole;
}

export class PasswordResetRequestDto {
  @ValidateIf((o: PasswordResetRequestDto) => !o.phoneE164)
  @IsEmail()
  email?: string;

  @ValidateIf((o: PasswordResetRequestDto) => !o.email)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164?: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @MinLength(4)
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class AdminTotpEnableDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

export class AdminTotpDisableDto {
  @IsString()
  @MinLength(6)
  code!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ConsumeImpersonationDto {
  @IsString()
  @MinLength(16)
  token!: string;
}

export class OAuthGoogleDto {
  /** Google GIS credential (ID token). Required unless local mock fields are sent. */
  @ValidateIf((o: OAuthGoogleDto) => !o.email)
  @IsString()
  @MinLength(20)
  idToken?: string;

  /** Local/dev mock only — ignored (and rejected) outside local mock mode. */
  @ValidateIf((o: OAuthGoogleDto) => !o.idToken)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  /** App requesting sign-in. Defaults to PASSENGER. */
  @IsOptional()
  @IsIn([UserRole.PASSENGER, UserRole.DRIVER])
  role?: UserRole;
}

export class OAuthAppleDto {
  @ValidateIf((o: OAuthAppleDto) => !o.email)
  @IsString()
  @MinLength(20)
  idToken?: string;

  @ValidateIf((o: OAuthAppleDto) => !o.idToken)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  /** App requesting sign-in. Defaults to PASSENGER. */
  @IsOptional()
  @IsIn([UserRole.PASSENGER, UserRole.DRIVER])
  role?: UserRole;
}

export class OAuthLinkPhoneDto {
  @IsString()
  @MinLength(20)
  linkToken!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be E.164 (e.g. +14165551234)',
  })
  phoneE164!: string;
}
