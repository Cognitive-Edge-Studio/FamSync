import { BadRequestException, Body, Controller, Get, Header, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { DatabaseService } from './database.service.js';

const presenceInput = z.strictObject({ online: z.boolean() });
const privacyInput = z.strictObject({ shareReceipts: z.boolean(), sharePresence: z.boolean() });
class PresenceDto { @ApiProperty() online!: boolean; }
class ChatPrivacyDto {
  @ApiProperty() shareReceipts!: boolean;
  @ApiProperty() sharePresence!: boolean;
}

@Controller('api/v1/me')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ChatStatusController {
  constructor(private readonly database: DatabaseService) {}

  @Put('presence') @ApiOperation({ operationId: 'setMyPresence' }) @ApiOkResponse({ type: PresenceDto })
  presence(@Req() { actorId }: AuthenticatedRequest, @Body() body: PresenceDto): Promise<PresenceDto> {
    const input = presenceInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Choose online or offline.');
    return this.database.withActor(actorId, async (client) => {
      await client.query('select app.set_presence($1)', [input.data.online]);
      return input.data;
    });
  }

  @Get('chat-privacy') @Header('Cache-Control', 'no-store') @ApiOperation({ operationId: 'getMyChatPrivacy' }) @ApiOkResponse({ type: ChatPrivacyDto })
  get(@Req() { actorId }: AuthenticatedRequest): Promise<ChatPrivacyDto> {
    return this.database.withActor(actorId, async (client) => {
      const { rows } = await client.query<ChatPrivacyDto>('select share_receipts as "shareReceipts",share_presence as "sharePresence" from app.chat_privacy where user_id=$1', [actorId]);
      return rows[0] ?? { shareReceipts: true, sharePresence: true };
    });
  }

  @Put('chat-privacy') @ApiOperation({ operationId: 'setMyChatPrivacy' }) @ApiOkResponse({ type: ChatPrivacyDto })
  put(@Req() { actorId }: AuthenticatedRequest, @Body() body: ChatPrivacyDto): Promise<ChatPrivacyDto> {
    const input = privacyInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Choose what to share.');
    return this.database.withActor(actorId, async (client) => {
      await client.query('select app.set_chat_privacy($1,$2)', [input.data.shareReceipts, input.data.sharePresence]);
      return input.data;
    });
  }
}
