import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CreateRatingDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post(':id/ratings')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratings.create(user.id, id, dto);
  }

  @Get(':id/ratings')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ratings.listForRide(user.id, id);
  }
}
