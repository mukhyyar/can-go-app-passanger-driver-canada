import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthVerifyService } from './oauth-verify.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ImpersonationReadOnlyInterceptor } from './guards/impersonation-readonly.interceptor';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
      }),
    }),
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthVerifyService,
    PasswordService,
    TokensService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ImpersonationReadOnlyInterceptor,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokensService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ImpersonationReadOnlyInterceptor,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
