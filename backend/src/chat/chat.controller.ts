import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

class SendChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

@Controller('rides/:rideId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  thread(@CurrentUser() user: AuthUser, @Param('rideId') rideId: string) {
    return this.chat.getOrCreateThread(user.id, rideId);
  }

  @Post('messages')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  send(
    @CurrentUser() user: AuthUser,
    @Param('rideId') rideId: string,
    @Body() dto: SendChatDto,
  ) {
    return this.chat.send(user.id, rideId, dto.body);
  }

  @Delete('messages/:messageId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
  ) {
    return this.chat.softDelete(user.id, messageId);
  }

  @Post('messages/:messageId/flag')
  flag(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
  ) {
    return this.chat.flag(user.id, messageId);
  }
}
