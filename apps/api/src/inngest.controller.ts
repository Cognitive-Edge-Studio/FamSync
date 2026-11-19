import { All, Controller, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { serve } from "inngest/express";
import { JobsService } from "./jobs.service.js";

// Inngest calls this endpoint to register and run jobs. Outside dev mode the SDK verifies each request's
// signature with INNGEST_SIGNING_KEY and rejects unsigned calls. It runs after Nest's JSON body parser.
@ApiExcludeController()
@Controller("api/inngest")
export class InngestController {
  private readonly handler: (request: unknown, response: unknown) => unknown;

  constructor(jobs: JobsService) {
    this.handler = serve({ client: jobs.inngest, functions: jobs.functions() });
  }

  @All()
  handle(@Req() request: unknown, @Res() response: unknown) {
    return this.handler(request, response);
  }
}
