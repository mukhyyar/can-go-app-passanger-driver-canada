import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { CMS_KINDS } from './cms.defaults';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CmsService, PromoService } from './cms.service';

class UpsertCmsDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  bodyMd!: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsIn([...CMS_KINDS])
  kind?: (typeof CMS_KINDS)[number];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class CreatePromoDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/i)
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  percentOff?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountOff?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

@Controller('cms')
export class CmsPublicController {
  constructor(private readonly cms: CmsService) {}

  @Get('pages')
  list(@Query('kind') kind?: string) {
    return this.cms.listPublic(kind);
  }

  @Get('pages/:slug')
  get(@Param('slug') slug: string) {
    return this.cms.getPublic(slug);
  }
}

@Controller('admin/cms')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CmsAdminController {
  constructor(private readonly cms: CmsService) {}

  @Put('pages')
  @RequirePermission('cms.edit')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertCmsDto) {
    return this.cms.adminUpsert(user.id, dto);
  }

  @Delete('pages/:slug')
  @RequirePermission('cms.edit')
  remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.cms.adminDelete(user.id, slug);
  }
}

@Controller('admin/promos')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PromoAdminController {
  constructor(private readonly promos: PromoService) {}

  @Get()
  @RequirePermission('promos.view')
  list() {
    return this.promos.list();
  }

  @Post()
  @RequirePermission('promos.edit')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoDto) {
    return this.promos.adminCreate(user.id, dto);
  }
}
