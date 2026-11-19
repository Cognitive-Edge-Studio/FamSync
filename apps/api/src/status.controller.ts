import { Controller, Get, Header, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse } from "@nestjs/swagger";
import { DatabaseService } from "./database.service.js";

class ReadyDto {
  @ApiProperty({ enum: ["ok"] })
  status!: "ok";
}

class NotReadyDto {
  @ApiProperty({ enum: ["unavailable"] })
  status!: "unavailable";
}

@Controller("api/v1/status")
export class StatusController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getApiStatus", summary: "Check if the API can access its database schema" })
  @ApiOkResponse({ type: ReadyDto })
  @ApiServiceUnavailableResponse({ type: NotReadyDto })
  async getStatus(): Promise<ReadyDto> {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
    return { status: "ok" };
  }
}
