import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { KycOpsService, type KycListQuery } from './kyc-ops.service';
import {
  AddKycNoteDto,
  ApproveKycDto,
  AssignKycDto,
  BulkAssignKycDto,
  RejectKycDto,
  RequestChangesDto,
  RequestResubmissionDto,
  ReviewDocumentDto,
} from './dto/drivers.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminKycController {
  constructor(private readonly kyc: KycOpsService) {}

  @Get('drivers/kyc')
  @RequirePermission('kyc.view')
  listKyc(@Query() query: KycListQuery) {
    return this.kyc.listQueue(query);
  }

  @Post('drivers/kyc/assign')
  @RequirePermission('kyc.approve')
  bulkAssign(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAssignKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.bulkAssign(user, dto, req.ip);
  }

  @Get('drivers/:driverId/kyc')
  @RequirePermission('kyc.view')
  getDriverKyc(@Param('driverId') driverId: string) {
    return this.kyc.getWorkspace(driverId);
  }

  @Get('drivers/:driverId/kyc/audit')
  @RequirePermission('kyc.view')
  getAudit(@Param('driverId') driverId: string) {
    return this.kyc.listAudit(driverId);
  }

  @Post('drivers/:driverId/kyc/notes')
  @RequirePermission('kyc.approve')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: AddKycNoteDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.addNote(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/assign')
  @RequirePermission('kyc.approve')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: AssignKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.assign(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/approve')
  @RequirePermission('kyc.approve')
  approveKyc(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: ApproveKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.approveKyc(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/request-changes')
  @RequirePermission('kyc.approve')
  requestChanges(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: RequestChangesDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.requestChanges(user, driverId, dto, req.ip);
  }

  @Post('documents/:documentId/review')
  @RequirePermission('kyc.approve')
  reviewDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.reviewDocument(user, documentId, dto, req.ip);
  }

  @Post('documents/:documentId/request-resubmission')
  @RequirePermission('kyc.approve')
  requestResubmission(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: RequestResubmissionDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.requestResubmission(user, documentId, dto, req.ip);
  }

  @Post('drivers/:driverId/activate')
  @RequirePermission('kyc.approve')
  activate(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.activate(user, driverId, req.ip);
  }

  @Post('drivers/:driverId/deactivate')
  @RequirePermission('kyc.approve')
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.deactivate(user, driverId, req.ip);
  }

  @Post('drivers/:driverId/reject-kyc')
  @RequirePermission('kyc.approve')
  rejectKyc(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: RejectKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.rejectKyc(user, driverId, dto, req.ip);
  }
}
