import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole, SupportCaseStatus, SupportCaseType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminOpsService } from './admin.service';
import { AdminRbacService } from './rbac.service';
import {
  BroadcastDto,
  CaseCreateDto,
  FareRuleDto,
  ImpersonateDto,
  RefundDto,
  SuspendDto,
} from './admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminOpsController {
  constructor(
    private readonly ops: AdminOpsService,
    private readonly rbac: AdminRbacService,
  ) {}

  @Get('dashboard/kpis')
  @RequirePermission('dashboard.view')
  kpis(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ops.dashboardKpis(range ?? '30d', from, to);
  }

  @Get('dashboard/series')
  @RequirePermission('dashboard.view')
  series(
    @Query('metric') metric?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ops.dashboardSeries(metric ?? 'overview', range ?? '30d', from, to);
  }

  @Get('search')
  @RequirePermission('search.view')
  search(@Query('q') q?: string) {
    return this.ops.search(q ?? '');
  }

  @Get('users')
  @RequirePermission('users.view')
  users(
    @Query('role') role?: string,
    @Query('q') q?: string,
    @Query('suspended') suspended?: string,
  ) {
    return this.ops.listUsers({ role, q, suspended });
  }

  @Get('users/:id/360')
  @RequirePermission('users.view')
  user360(@Param('id') id: string) {
    return this.ops.user360(id);
  }

  @Post('users/:id/suspend')
  @RequirePermission('users.suspend')
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuspendDto,
    @Req() req: { ip?: string },
  ) {
    return this.ops.setSuspended(user.id, id, dto.isSuspended, dto.reason, req.ip);
  }

  @Post('users/:id/impersonate')
  @RequirePermission('users.impersonate')
  impersonate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ImpersonateDto,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.ops.issueImpersonation(user.id, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('drivers')
  @RequirePermission('drivers.view')
  drivers() {
    return this.ops.listDrivers();
  }

  @Get('passengers')
  @RequirePermission('users.view')
  passengers() {
    return this.ops.listPassengers();
  }

  @Get('vehicles')
  @RequirePermission('vehicles.view')
  vehicles() {
    return this.ops.listVehicles();
  }

  @Get('vip-requests')
  @RequirePermission('users.vip')
  vipRequests() {
    return this.ops.listVipRequests();
  }

  @Get('rides')
  @RequirePermission('rides.view')
  rides(
    @Query('status') status?: string,
    @Query('bucket') bucket?: string,
    @Query('serviceType') serviceType?: string,
    @Query('q') q?: string,
  ) {
    return this.ops.listRides({ status, bucket, serviceType, q });
  }

  @Get('rides/:id')
  @RequirePermission('rides.view')
  ride(@Param('id') id: string) {
    return this.ops.getRide(id);
  }

  @Get('offers')
  @RequirePermission('offers.view')
  offers() {
    return this.ops.listOffers();
  }

  @Get('ops/map')
  @RequirePermission('map.view')
  map() {
    return this.ops.opsMap();
  }

  @Get('finance/overview')
  @RequirePermission('finance.view')
  finance(@Query('range') range?: string) {
    return this.ops.financeOverview(range ?? '30d');
  }

  @Get('payments')
  @RequirePermission('payments.view')
  payments(@Query('status') status?: string) {
    return this.ops.listPayments(status);
  }

  @Post('payments/:id/refund')
  @RequirePermission('payments.refund')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @Req() req: { ip?: string },
  ) {
    return this.ops.issueRefund(user.id, id, dto, req.ip);
  }

  @Get('refunds')
  @RequirePermission('payments.view')
  refunds() {
    return this.ops.listRefunds();
  }

  @Get('earnings')
  @RequirePermission('finance.view')
  earnings() {
    return this.ops.earnings();
  }

  @Get('fare-rules')
  @RequirePermission('pricing.view')
  fareRules() {
    return this.ops.listFareRules();
  }

  @Put('fare-rules')
  @RequirePermission('pricing.edit')
  createFare(
    @CurrentUser() user: AuthUser,
    @Body() dto: FareRuleDto,
    @Req() req: { ip?: string },
  ) {
    return this.ops.upsertFareRule(user.id, undefined, dto as never, req.ip);
  }

  @Put('fare-rules/:id')
  @RequirePermission('pricing.edit')
  updateFare(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FareRuleDto,
    @Req() req: { ip?: string },
  ) {
    return this.ops.upsertFareRule(user.id, id, dto as never, req.ip);
  }

  @Patch('promos/:id')
  @RequirePermission('promos.edit')
  patchPromo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { active?: boolean; maxUses?: number; endsAt?: string | null },
    @Req() req: { ip?: string },
  ) {
    return this.ops.patchPromo(user.id, id, dto, req.ip);
  }

  @Get('cms/pages')
  @RequirePermission('cms.view')
  cmsPages(@Query('kind') kind?: string) {
    return this.ops.listCmsPages(kind);
  }

  @Get('catalog')
  @RequirePermission('catalog.view')
  catalog() {
    return this.ops.listCatalog();
  }

  @Put('catalog')
  @RequirePermission('catalog.edit')
  upsertCatalog(
    @CurrentUser() user: AuthUser,
    @Body() dto: Record<string, unknown>,
    @Req() req: { ip?: string },
  ) {
    const id = typeof dto.id === 'string' ? dto.id : undefined;
    return this.ops.upsertCatalog(user.id, id, dto as never, req.ip);
  }

  @Get('zones')
  @RequirePermission('pricing.view')
  zones() {
    return this.ops.listZones();
  }

  @Get('referrals')
  @RequirePermission('dashboard.view')
  referrals() {
    return this.ops.listReferrals();
  }

  @Get('growth')
  @RequirePermission('dashboard.view')
  growth() {
    return this.ops.growthStats();
  }

  @Get('chat/flagged')
  @RequirePermission('chat.view')
  flagged() {
    return this.ops.flaggedChat();
  }

  @Get('risk/accounts')
  @RequirePermission('risk.view')
  risk() {
    return this.ops.riskAccounts();
  }

  @Get('watchlist')
  @RequirePermission('risk.view')
  watchlist() {
    return this.ops.listWatchlist();
  }

  @Post('watchlist/:userId')
  @RequirePermission('risk.act')
  watch(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: { reason: string },
  ) {
    return this.ops.watchlist(user.id, userId, dto.reason);
  }

  @Delete('watchlist/:userId')
  @RequirePermission('risk.act')
  unwatch(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.ops.unwatch(user.id, userId);
  }

  @Get('cases')
  @RequirePermission('cases.view')
  cases(@CurrentUser() user: AuthUser, @Query('queue') queue?: string) {
    return this.ops.listCases({ queue, adminId: user.id });
  }

  @Post('cases')
  @RequirePermission('cases.manage')
  createCase(@CurrentUser() user: AuthUser, @Body() dto: CaseCreateDto) {
    return this.ops.createCase(user.id, {
      ...dto,
      type: dto.type as SupportCaseType | undefined,
    });
  }

  @Patch('cases/:id')
  @RequirePermission('cases.manage')
  updateCase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status?: SupportCaseStatus; assigneeId?: string | null; note?: string },
  ) {
    return this.ops.updateCase(user.id, id, dto);
  }

  @Get('notifications/templates')
  @RequirePermission('notifications.view')
  templates() {
    return this.ops.listTemplates();
  }

  @Put('notifications/templates')
  @RequirePermission('notifications.send')
  upsertTemplate(
    @Body()
    dto: {
      id?: string;
      key: string;
      channel: string;
      title: string;
      body: string;
      active?: boolean;
    },
  ) {
    return this.ops.upsertTemplate(dto);
  }

  @Get('notifications/deliveries')
  @RequirePermission('notifications.view')
  deliveries() {
    return this.ops.listDeliveries();
  }

  @Get('notifications/campaigns')
  @RequirePermission('notifications.view')
  campaigns() {
    return this.ops.listCampaigns();
  }

  @Post('notifications/send')
  @RequirePermission('notifications.send')
  send(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    return this.ops.sendBroadcast(user.id, dto);
  }

  @Get('audit-logs')
  @RequirePermission('audit.view')
  audit(
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('q') q?: string,
  ) {
    return this.ops.listAudit({ action, resource, q });
  }

  @Get('sessions')
  @RequirePermission('audit.view')
  sessions() {
    return this.ops.listSessions();
  }

  @Get('webhooks')
  @RequirePermission('settings.view')
  webhooks() {
    return this.ops.listWebhooks();
  }

  @Get('errors')
  @RequirePermission('settings.view')
  errors() {
    return this.ops.listErrors();
  }

  @Get('feature-flags')
  @RequirePermission('settings.view')
  flags() {
    return this.ops.listFlags();
  }

  @Patch('feature-flags/:key')
  @RequirePermission('settings.edit')
  setFlag(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: { enabled: boolean },
  ) {
    return this.ops.setFlag(user.id, key, dto.enabled);
  }

  @Get('platform/health')
  @RequirePermission('settings.view')
  health() {
    return this.ops.platformHealth();
  }

  @Get('roles')
  @RequirePermission('roles.manage')
  roles() {
    return this.rbac.listRoles();
  }

  @Get('permissions')
  @RequirePermission('roles.manage')
  permissionCatalog() {
    return this.rbac.catalog();
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles.manage')
  setPerms(
    @Param('id') id: string,
    @Body() dto: { permissions: string[] },
  ) {
    return this.rbac.setRolePermissions(id, dto.permissions);
  }

  @Get('admin-users')
  @RequirePermission('roles.manage')
  adminUsers() {
    return this.rbac.listAdminUsers();
  }

  @Patch('admin-users/:id/role')
  @RequirePermission('roles.manage')
  assignRole(
    @Param('id') id: string,
    @Body() dto: { adminRoleId: string | null },
  ) {
    return this.rbac.assignUserRole(id, dto.adminRoleId);
  }

  @Get('reports/:kind')
  @RequirePermission('reports.export')
  @Header('Content-Type', 'text/csv')
  report(@Param('kind') kind: string) {
    return this.ops.csvReport(kind);
  }
}
