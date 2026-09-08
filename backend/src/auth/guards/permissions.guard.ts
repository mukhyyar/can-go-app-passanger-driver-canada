import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import type { Permission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (user.role === UserRole.SUPER_ADMIN) return true;

    const perms = user.permissions ?? [];
    if (!perms.includes(required)) {
      throw new ForbiddenException(`Missing permission ${required}`);
    }
    return true;
  }
}
