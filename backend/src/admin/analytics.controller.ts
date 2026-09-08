import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminAnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('meta')
  @RequirePermission('analytics.view')
  meta() {
    return this.analytics.meta();
  }

  @Get('overview')
  @RequirePermission('analytics.view')
  overview(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.overview(this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('live')
  @RequirePermission('analytics.view')
  live(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('live', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('rides')
  @RequirePermission('analytics.view')
  rides(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('rides', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('revenue')
  @RequirePermission('analytics.financial')
  revenue(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('revenue', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('drivers')
  @RequirePermission('analytics.view')
  drivers(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('drivers', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('passengers')
  @RequirePermission('analytics.view')
  passengers(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('passengers', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('geography')
  @RequirePermission('analytics.view')
  geography(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('geography', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('cancellations')
  @RequirePermission('analytics.view')
  cancellations(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('cancellations', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('payments')
  @RequirePermission('analytics.financial')
  payments(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('payments', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('retention')
  @RequirePermission('analytics.view')
  retention(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('retention', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('funnel')
  @RequirePermission('analytics.view')
  funnel(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('funnel', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('operations')
  @RequirePermission('analytics.view')
  operations(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('operations', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('forecast')
  @RequirePermission('analytics.view')
  forecast(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('forecast', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('promotions')
  @RequirePermission('analytics.view')
  promotions(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('promotions', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('ratings')
  @RequirePermission('analytics.view')
  ratings(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('ratings', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('safety')
  @RequirePermission('analytics.safety')
  safety(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('safety', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('heatmap')
  @RequirePermission('analytics.view')
  heatmap(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    return this.analytics.section('heatmap', this.analytics.parse(query), user.permissions ?? []);
  }

  @Get('drilldown')
  @RequirePermission('analytics.view')
  drilldown(
    @Query() query: Record<string, string | undefined>,
    @Query('metric') metric?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
  ) {
    return this.analytics.drilldown(
      this.analytics.parse(query),
      metric ?? 'rides',
      Number(page ?? 1),
      Number(pageSize ?? 25),
      sort ?? 'createdAt',
      dir === 'asc' ? 'asc' : 'desc',
    );
  }

  @Get('export')
  @RequirePermission('analytics.export')
  async export(
    @Query() query: Record<string, string | undefined>,
    @Query('section') section?: string,
    @Query('format') format?: string,
    @CurrentUser() user?: AuthUser,
    @Res() res?: Response,
  ) {
    const file = await this.analytics.exportReport(
      this.analytics.parse(query),
      section ?? 'overview',
      format ?? 'csv',
      user?.permissions ?? [],
    );
    res!.setHeader('Content-Type', file.mime);
    res!.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res!.send(file.body);
  }

  @Post('reports/run')
  @RequirePermission('analytics.view')
  runReport(
    @Query() query: Record<string, string | undefined>,
    @Body()
    body: { metrics: string[]; dimension: string; chartType?: string },
  ) {
    return this.analytics.customReport(this.analytics.parse(query), body);
  }

  @Get('views')
  @RequirePermission('analytics.view')
  views(@CurrentUser() user: AuthUser, @Query('kind') kind?: string) {
    return this.analytics.listViews(user.id, kind);
  }

  @Post('views')
  @RequirePermission('analytics.view')
  saveView(
    @CurrentUser() user: AuthUser,
    @Body() dto: { name: string; kind?: string; query: unknown },
  ) {
    return this.analytics.saveView(user.id, dto.name, dto.kind ?? 'filter', dto.query);
  }

  @Delete('views/:id')
  @RequirePermission('analytics.view')
  deleteView(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.analytics.deleteView(user.id, id);
  }
}
