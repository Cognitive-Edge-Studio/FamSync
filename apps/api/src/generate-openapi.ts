import "reflect-metadata";
import { writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const config = new DocumentBuilder().setTitle("FamSync API").setVersion("1").addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config);
    const file = new URL("../../../packages/api-client/openapi.json", import.meta.url);
    await writeFile(file, JSON.stringify(document, null, 2) + "\n");
  } finally {
    await app.close();
  }
}

generate().catch((error: unknown) => {
  console.error("Could not generate the FamSync API contract.", error);
  process.exitCode = 1;
});
