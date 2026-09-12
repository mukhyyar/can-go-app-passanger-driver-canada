import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@Controller('rides/:rideId')
@UseGuards(JwtAuthGuard)
export class RideContactController {
  constructor(private readonly chat: ChatService) {}

  @Get('contact')
  contact(@CurrentUser() user: AuthUser, @Param('rideId') rideId: string) {
    return this.chat.getContact(user.id, rideId);
  }
}
