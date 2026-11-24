import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';

export class AndroidVersionPolicyDto {
  @ApiProperty({ minimum: 1, maximum: 2100000000 }) minimumBuild!: number;
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) updateUrl!: string | null;
}

/** Read once at startup, so a malformed release policy cannot silently disable the check. */
export function androidVersionPolicy(env: Record<string, string | undefined>): AndroidVersionPolicyDto {
  const value = env.ANDROID_MINIMUM_BUILD ?? '1';
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2100000000) {
    throw new Error('ANDROID_MINIMUM_BUILD must be an Android version code from 1 to 2100000000.');
  }
  let updateUrl: string | null = null;
  if (env.ANDROID_UPDATE_URL?.trim()) {
    const url = URL.parse(env.ANDROID_UPDATE_URL.trim());
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('ANDROID_UPDATE_URL must be an HTTPS address without credentials.');
    }
    updateUrl = url.href;
  }
  return { minimumBuild: Number(value), updateUrl };
}

// Public so the installed binary is checked before sign-in. This endpoint contains no family or account data.
@Controller('api/v1/mobile/android')
export class MobileVersionController {
  private readonly policy = androidVersionPolicy(process.env);

  @Get('version') @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'getAndroidVersionPolicy' }) @ApiOkResponse({ type: AndroidVersionPolicyDto })
  version(): AndroidVersionPolicyDto { return this.policy; }
}
