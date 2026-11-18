import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DriversService } from './drivers.service';

@Controller('stripe')
export class StripeConnectController {
  constructor(private readonly drivers: DriversService) {}

  @Get('return')
  async handleReturn(
    @Query('accountId') accountId: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.drivers.handleStripeConnectReturn(accountId);
    if (accept && accept.includes('application/json') && !accept.includes('text/html')) {
      return res.status(200).json(result);
    }

    const isActive = result.status === 'ACTIVE' && result.payoutsEnabled;
    const title = isActive
      ? 'Stripe Payouts Connected'
      : 'Stripe Verification In Progress';
    const message = isActive
      ? 'Your Canadian bank account is connected with Stripe Express. You can now return to the CAN-RIDE Driver App.'
      : 'Your details have been submitted to Stripe. If additional verification documents are required, you can complete them from the CAN-RIDE Driver App.';
    const badgeColor = isActive ? '#15803d' : '#b45309';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · CAN-RIDE</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; max-width: 440px; width: 100%; padding: 28px 24px; text-align: center; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #fff; background: ${badgeColor}; margin-bottom: 14px; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { font-size: 14px; line-height: 1.5; color: #475569; margin: 0 0 22px; }
    .btn { display: inline-block; background: #dc2626; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${result.status}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="canride://onboarding/payment">Return to CAN-RIDE Driver App</a>
  </div>
</body>
</html>`);
  }

  @Get('refresh')
  async handleRefresh(
    @Query('accountId') accountId: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.drivers.handleStripeConnectRefresh(accountId);
    if (accept && accept.includes('application/json') && !accept.includes('text/html')) {
      return res.status(200).json(result);
    }
    if (result.ok && result.url) {
      return res.redirect(302, result.url);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Refresh Stripe Onboarding · CAN-RIDE</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; max-width: 440px; width: 100%; padding: 28px 24px; text-align: center; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { font-size: 14px; line-height: 1.5; color: #475569; margin: 0 0 22px; }
    .btn { display: inline-block; background: #dc2626; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Onboarding Link Expired</h1>
    <p>Please return to the CAN-RIDE Driver App and tap "Set Up Stripe Payouts" to generate a fresh onboarding link.</p>
    <a class="btn" href="canride://onboarding/payment">Return to CAN-RIDE Driver App</a>
  </div>
</body>
</html>`);
  }
}
