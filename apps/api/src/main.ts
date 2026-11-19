import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { getAllowedWebOrigins } from "./cors.js";
import { requestContext } from "./request-context.js";

async function start() {
  const port = Number(process.env.PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }

  const allowedOrigins = getAllowedWebOrigins();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
  });
  app.use(requestContext);
  app.enableShutdownHooks();
  await app.listen(port, process.env.HOST ?? "127.0.0.1");
  // Keep idle connections open longer than callers such as the job scheduler pool them,
  // so a reused connection is not closed mid-request.
  const server = app.getHttpServer() as { keepAliveTimeout: number; headersTimeout: number };
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

start().catch((error: unknown) => {
  console.error("Could not start the FamSync API.", error);
  process.exitCode = 1;
});
