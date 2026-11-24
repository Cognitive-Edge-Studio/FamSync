import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { DatabaseService } from './database.service.js';
import { PushService } from './push.service.js';

const key = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+=*$/);
const saveInput = z.strictObject({ familyId: z.uuid().nullable(), endpoint: z.string().max(1000), p256dh: key(80, 100), auth: key(16, 40) });
const removeInput = z.strictObject({ endpoint: z.string().max(1000) });
class PushSettingsDto { @ApiProperty({ description: 'Empty when push is not available on this server.' }) publicKey!: string; }
class PushSubscriptionDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) familyId!: string | null;
  @ApiProperty() endpoint!: string;
  @ApiProperty() p256dh!: string;
  @ApiProperty() auth!: string;
}
class PushEndpointDto { @ApiProperty() endpoint!: string; }
class PushSavedDto { @ApiProperty() enabled!: boolean; }

@Controller('api/v1/me/push')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PushController {
  constructor(private readonly database: DatabaseService, private readonly push: PushService) {}

  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ operationId: 'getPushSettings' }) @ApiOkResponse({ type: PushSettingsDto })
  settings(): PushSettingsDto { return { publicKey: this.push.configured ? this.push.publicKey : '' }; }

  @Put() @ApiOperation({ operationId: 'savePushSubscription' }) @ApiOkResponse({ type: PushSavedDto })
  async save(@Req() { actorId }: AuthenticatedRequest, @Body() body: PushSubscriptionDto): Promise<PushSavedDto> {
    const input = saveInput.safeParse(body);
    if (!input.success || !this.push.allowedEndpoint(input.data.endpoint)) throw new BadRequestException('This browser’s push service is not supported.');
    if (!this.push.configured) throw new BadRequestException('Push is not available on this server.');
    const { familyId, endpoint, p256dh, auth } = input.data;
    try {
      await this.database.withActor(actorId, (client) => client.query('select app.save_push_subscription($1,$2,$3,$4)', [familyId, endpoint, p256dh, auth]));
    } catch (error) {
      if ((error as { code?: string }).code === 'P0002') throw new NotFoundException('Family not found.');
      throw error;
    }
    return { enabled: true };
  }

  @Delete() @ApiOperation({ operationId: 'removePushSubscription' }) @ApiOkResponse({ type: PushSavedDto })
  async remove(@Req() { actorId }: AuthenticatedRequest, @Body() body: PushEndpointDto): Promise<PushSavedDto> {
    const input = removeInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Choose a browser to remove.');
    await this.database.withActor(actorId, (client) => client.query('select app.remove_push_subscription($1)', [input.data.endpoint]));
    return { enabled: false };
  }
}
