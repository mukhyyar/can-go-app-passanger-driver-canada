import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  id: string;
  role: string;
  sessionId?: string;
  email?: string | null;
  permissions?: string[];
  impersonation?: {
    enabled: boolean;
    by?: string;
    sessionId?: string;
    readOnly: boolean;
  };
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
