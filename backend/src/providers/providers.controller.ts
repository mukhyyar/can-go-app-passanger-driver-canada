import { Controller, Get } from '@nestjs/common';
import { LaunchGateService } from './launch-gate.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly launchGate: LaunchGateService) {}

  /** Phase 0 introspection — no secrets returned. */
  @Get('status')
  status() {
    return this.launchGate.status;
  }
}
