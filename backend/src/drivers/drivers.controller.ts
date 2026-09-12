import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { DriversService } from './drivers.service';
import {
  CreateVehicleDto,
  UpdateDriverProfileDto,
  UpdatePaymentDetailsDto,
  UpdateVehicleDto,
  UploadDocumentMetaDto,
  UpsertZoneDto,
} from './dto/drivers.dto';
import { MAX_UPLOAD_BYTES } from './documents.constants';

@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.drivers.getMyProfile(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDriverProfileDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.updateMyProfile(user.id, dto, req.ip);
  }

  @Get('me/account-status')
  accountStatus(@CurrentUser() user: AuthUser) {
    return this.drivers.getAccountStatus(user.id);
  }

  @Get('me/payment-details')
  getPayment(@CurrentUser() user: AuthUser) {
    return this.drivers.getPaymentDetails(user.id);
  }

  @Patch('me/payment-details')
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePaymentDetailsDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.updatePaymentDetails(user.id, dto, req.ip);
  }

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthUser) {
    return this.drivers.listMyDocuments(user.id);
  }

  @Get('documents/:id')
  getDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drivers.getDocumentSignedUrl(user.id, id);
  }

  @Post('documents')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDocumentMetaDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.uploadDocument(user.id, file, body, req.ip);
  }

  @Post('documents/:id/reupload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  reupload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.reuploadRejected(user.id, id, file, req.ip);
  }

  @Delete('documents/:id')
  deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.deleteMyDocument(user.id, id, req.ip);
  }

  @Get('vehicles')
  listVehicles(@CurrentUser() user: AuthUser) {
    return this.drivers.listVehicles(user.id);
  }

  @Post('vehicles')
  createVehicle(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVehicleDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.createVehicle(user.id, dto, req.ip);
  }

  @Get('vehicles/:id')
  getVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drivers.getVehicle(user.id, id);
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.updateVehicle(user.id, id, dto, req.ip);
  }

  @Delete('vehicles/:id')
  deleteVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.deleteVehicle(user.id, id, req.ip);
  }

  @Get('operating-zones')
  listZones(@CurrentUser() user: AuthUser) {
    return this.drivers.listZones(user.id);
  }

  @Post('operating-zones')
  createZone(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertZoneDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.upsertZone(user.id, dto, undefined, req.ip);
  }

  @Put('operating-zones/:id')
  updateZone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertZoneDto,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.upsertZone(user.id, dto, id, req.ip);
  }

  @Delete('operating-zones/:id')
  deleteZone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.drivers.deleteZone(user.id, id, req.ip);
  }
}
