import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
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
import { KycDocumentsService } from './kyc-documents.service';
import { sanitizeContentDispositionFilename } from './vehicle-photos.util';
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
import {
  ActivateDriverDto,
  AddKycFlagDto,
  AdminUploadDocumentDto,
  ClearKycFlagDto,
  DocumentActionDto,
  EditApplicantDto,
  EditDocumentMetadataDto,
  OverrideDocumentDto,
  ReopenKycDto,
  ResetKycDto,
  RestoreDocumentDto,
  SuspendDriverDto,
} from './dto/kyc-enterprise.dto';
import { MAX_UPLOAD_BYTES } from './documents.constants';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminKycController {
  constructor(
    private readonly kyc: KycOpsService,
    private readonly kycDocs: KycDocumentsService,
  ) {}

  @Get('drivers/kyc')
  @RequirePermission('kyc.view')
  listKyc(@Query() query: KycListQuery) {
    return this.kyc.listQueue(query);
  }

  @Post('drivers/kyc/assign')
  @RequirePermission('kyc.review')
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

  @Get('drivers/:driverId/kyc/export')
  @RequirePermission('kyc.view')
  exportSummary(@Param('driverId') driverId: string) {
    return this.kyc.exportSummary(driverId);
  }

  @Get('drivers/:driverId/kyc/audit')
  @RequirePermission('kyc.view')
  getAudit(@Param('driverId') driverId: string) {
    return this.kyc.listAudit(driverId);
  }

  @Patch('drivers/:driverId/kyc')
  @RequirePermission('kyc.approve')
  editApplicant(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: EditApplicantDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.editApplicant(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/notes')
  @RequirePermission('kyc.review')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: AddKycNoteDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.addNote(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/assign')
  @RequirePermission('kyc.review')
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
  @RequirePermission('kyc.review')
  requestChanges(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: RequestChangesDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.requestChanges(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/reopen')
  @RequirePermission('kyc.approve')
  reopenKyc(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: ReopenKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.reopenKyc(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/reset')
  @RequirePermission('kyc.override')
  resetKyc(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: ResetKycDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.resetKycReview(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/flags')
  @RequirePermission('kyc.review')
  addFlag(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: AddKycFlagDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.addFlag(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/flags/:flagId/clear')
  @RequirePermission('kyc.review')
  clearFlag(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('flagId') flagId: string,
    @Body() dto: ClearKycFlagDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.clearFlag(user, driverId, flagId, dto, req.ip);
  }

  @Get('drivers/:driverId/kyc/documents/:documentId/versions')
  @RequirePermission('kyc.view')
  listVersions(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.kycDocs.listVersions(user, driverId, documentId);
  }

  @Get('drivers/:driverId/kyc/documents/:documentId/content')
  @RequirePermission('kyc.document.view')
  async getDocumentContent(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Req() req: { ip?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.kyc.getDocumentContent(
      user,
      driverId,
      documentId,
      req.ip,
    );
    const safeName = sanitizeContentDispositionFilename(file.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeName}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.body);
  }

  @Get('drivers/:driverId/kyc/documents/:documentId/versions/:versionId')
  @RequirePermission('kyc.view')
  getVersion(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.kycDocs.getVersion(user, driverId, documentId, versionId);
  }

  @Post('drivers/:driverId/kyc/documents')
  @RequirePermission('kyc.approve')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AdminUploadDocumentDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.adminUpload(user, driverId, file, dto, req.ip);
  }

  @Patch('drivers/:driverId/kyc/documents/:documentId')
  @RequirePermission('kyc.approve')
  editDocumentMetadata(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: EditDocumentMetadataDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.editMetadata(user, driverId, documentId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/documents/:documentId/archive')
  @RequirePermission('kyc.approve')
  archiveDocument(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: DocumentActionDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.archive(user, driverId, documentId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/documents/:documentId/restore')
  @RequirePermission('kyc.approve')
  restoreDocument(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: RestoreDocumentDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.restore(user, driverId, documentId, dto, req.ip);
  }

  @Delete('drivers/:driverId/kyc/documents/:documentId')
  @RequirePermission('kyc.override')
  softDeleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: DocumentActionDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.softDelete(user, driverId, documentId, dto, req.ip);
  }

  @Post('drivers/:driverId/kyc/documents/:documentId/override')
  @RequirePermission('kyc.override')
  overrideDocument(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: OverrideDocumentDto,
    @Req() req: { ip?: string },
  ) {
    return this.kycDocs.overrideStatus(user, driverId, documentId, dto, req.ip);
  }

  @Post('documents/:documentId/review')
  @RequirePermission('kyc.review')
  reviewDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.reviewDocument(user, documentId, dto, req.ip);
  }

  @Post('documents/:documentId/request-resubmission')
  @RequirePermission('kyc.review')
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
    @Body() dto: ActivateDriverDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.activate(user, driverId, dto ?? {}, req.ip);
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

  @Post('drivers/:driverId/suspend')
  @RequirePermission('users.suspend')
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: SuspendDriverDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.suspendDriver(user, driverId, dto, req.ip);
  }

  @Post('drivers/:driverId/unsuspend')
  @RequirePermission('users.suspend')
  unsuspend(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: SuspendDriverDto,
    @Req() req: { ip?: string },
  ) {
    return this.kyc.unsuspendDriver(user, driverId, dto, req.ip);
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
