import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import {
  AdminTotpDisableDto,
  AdminTotpEnableDto,
  ConsumeImpersonationDto,
  LoginDto,
  LogoutDto,
  OAuthAppleDto,
  OAuthGoogleDto,
  OAuthLinkPhoneDto,
  OtpSendDto,
  OtpVerifyDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('oauth/config')
  oauthConfig() {
    return this.auth.oauthConfig();
  }

  @Post('oauth/google')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  oauthGoogle(
    @Body() dto: OAuthGoogleDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.auth.oauthGoogle(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('oauth/apple')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  oauthApple(
    @Body() dto: OAuthAppleDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.auth.oauthApple(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('oauth/link-phone')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  linkOAuthPhone(@Body() dto: OAuthLinkPhoneDto) {
    return this.auth.linkOAuthPhone(dto);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('otp/send')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  sendOtp(@Body() dto: OtpSendDto) {
    return this.auth.sendOtp(dto);
  }

  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.auth.verifyOtp(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  refresh(
    @Body() dto: RefreshDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, user);
  }

  @Post('impersonation/consume')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  consumeImpersonation(
    @Body() dto: ConsumeImpersonationDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.auth.consumeImpersonation(dto.token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('impersonation/end')
  @UseGuards(JwtAuthGuard)
  endImpersonation(@CurrentUser() user: AuthUser) {
    return this.auth.endImpersonation(user);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.id, id);
  }

  @Post('password-reset/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  passwordResetRequest(@Body() dto: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  passwordResetConfirm(@Body() dto: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(dto);
  }

  @Post('admin/2fa/setup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminTotpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.adminTotpSetup(user.id);
  }

  @Post('admin/2fa/enable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminTotpEnable(@CurrentUser() user: AuthUser, @Body() dto: AdminTotpEnableDto) {
    return this.auth.adminTotpEnable(user.id, dto);
  }

  @Post('admin/2fa/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminTotpDisable(@CurrentUser() user: AuthUser, @Body() dto: AdminTotpDisableDto) {
    return this.auth.adminTotpDisable(user.id, dto);
  }
}
