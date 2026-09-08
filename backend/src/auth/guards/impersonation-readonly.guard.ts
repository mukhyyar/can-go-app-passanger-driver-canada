import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../decorators/current-user.decorator';

const ALLOWED_WRITE_SUFFIXES = [
  '/auth/impersonation/end',
  '/auth/logout',
  '/auth/logout-all',
];

@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
      user?: AuthUser;
    }>();
    const user = req.user;
    if (!user?.impersonation?.readOnly) return true;

    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const path = req.originalUrl ?? req.url ?? '';
    if (ALLOWED_WRITE_SUFFIXES.some((s) => path.includes(s))) return true;

    throw new ForbiddenException(
      'Read-only impersonation: writes are blocked',
    );
  }
}
