import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LaunchGateService } from './launch-gate.service';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly launchGate: LaunchGateService,
    private readonly config: ConfigService,
  ) {}

  /** Phase 0 introspection — no secrets returned (publishable key is public by design). */
  @Get('status')
  status() {
    const publishableKey =
      this.config.get<string>('stripe.publishableKey')?.trim() || null;
    return {
      ...this.launchGate.status,
      stripePublishableKey: publishableKey,
    };
  }
}
