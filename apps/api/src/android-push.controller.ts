import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { DatabaseService } from './database.service.js';
import { AndroidPushService } from './android-push.service.js';

const saveInput = z.strictObject({ deviceId: z.uuid(), familyId: z.uuid(), token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:-]+$/) });
class AndroidPushSettingsDto { @ApiProperty() available!: boolean; }
class AndroidPushDeviceDto {
  @ApiProperty({ format: 'uuid' }) deviceId!: string;
  @ApiProperty({ format: 'uuid' }) familyId!: string;
  @ApiProperty() token!: string;
}
class AndroidPushRemoveDto { @ApiProperty({ format: 'uuid' }) deviceId!: string; }
class AndroidPushSavedDto { @ApiProperty() enabled!: boolean; }
class AndroidPushRevokeDto extends AndroidPushRemoveDto { @ApiProperty() token!: string; }
const revokeInput = saveInput.omit({ familyId: true });

// No login token is retained after sign-out. Knowledge of the matching secret FCM token permits only removal.
@Controller('api/v1/push/android')
export class AndroidPushRevocationController {
  constructor(private readonly database: DatabaseService) {}

  @Post('revoke') @HttpCode(200) @ApiOperation({ operationId: 'revokeAndroidPushDevice' }) @ApiOkResponse({ type: AndroidPushSavedDto })
  async revoke(@Body() body: AndroidPushRevokeDto): Promise<AndroidPushSavedDto> {
    const input = revokeInput.safeParse(body);
    if (!input.success) throw new BadRequestException('This phone could not remove notifications.');
    await this.database.withActor('00000000-0000-4000-8000-000000000000', (client) => client.query('select app.revoke_android_push($1,$2)', [input.data.deviceId, input.data.token]));
    return { enabled: false };
  }
}

@Controller('api/v1/me/push/android')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AndroidPushController {
  constructor(private readonly database: DatabaseService, private readonly push: AndroidPushService) {}

  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ operationId: 'getAndroidPushSettings' }) @ApiOkResponse({ type: AndroidPushSettingsDto })
  settings(): AndroidPushSettingsDto { return { available: this.push.configured }; }

  @Put() @ApiOperation({ operationId: 'saveAndroidPushDevice' }) @ApiOkResponse({ type: AndroidPushSavedDto })
  async save(@Req() { actorId, sessionId }: AuthenticatedRequest, @Body() body: AndroidPushDeviceDto): Promise<AndroidPushSavedDto> {
    const input = saveInput.safeParse(body);
    if (!input.success) throw new BadRequestException('This phone could not register for notifications.');
    if (!sessionId) throw new UnauthorizedException('Sign in again to enable phone notifications.');
    if (!this.push.configured) throw new BadRequestException('Phone notifications are not available on this server.');
    const { deviceId, familyId, token } = input.data;
    try {
      await this.database.withActor(actorId, (client) => client.query('select app.save_android_push($1,$2,$3,$4)', [deviceId, sessionId, familyId, token]));
    } catch (error) {
      if ((error as { code?: string }).code === 'P0002') throw new NotFoundException('Default family unavailable.');
      if ((error as { code?: string }).code === '42501') throw new UnauthorizedException('Sign in again to enable phone notifications.');
      throw error;
    }
    return { enabled: true };
  }

  @Delete() @ApiOperation({ operationId: 'removeAndroidPushDevice' }) @ApiOkResponse({ type: AndroidPushSavedDto })
  async remove(@Req() { actorId }: AuthenticatedRequest, @Body() body: AndroidPushRemoveDto): Promise<AndroidPushSavedDto> {
    const input = z.strictObject({ deviceId: z.uuid() }).safeParse(body);
    if (!input.success) throw new BadRequestException('Choose a phone to remove.');
    await this.database.withActor(actorId, (client) => client.query('select app.remove_android_push($1)', [input.data.deviceId]));
    return { enabled: false };
  }
}
