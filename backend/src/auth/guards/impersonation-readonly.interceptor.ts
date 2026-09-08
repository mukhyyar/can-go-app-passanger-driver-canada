import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '../decorators/current-user.decorator';

const ALLOWED_WRITE_SUFFIXES = [
  '/auth/impersonation/end',
  '/auth/logout',
  '/auth/logout-all',
];

@Injectable()
export class ImpersonationReadOnlyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
      user?: AuthUser;
    }>();
    const user = req.user;
    if (!user?.impersonation?.readOnly) return next.handle();

    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const path = req.originalUrl ?? req.url ?? '';
    if (ALLOWED_WRITE_SUFFIXES.some((s) => path.includes(s))) {
      return next.handle();
    }

    throw new ForbiddenException(
      'Read-only impersonation: writes are blocked',
    );
  }
}
