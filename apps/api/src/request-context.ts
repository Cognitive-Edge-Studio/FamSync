import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Request = { header(name: string): string | undefined };
type Response = { setHeader(name: string, value: string): unknown };

const storage = new AsyncLocalStorage<{ requestId: string }>();
const acceptedId = /^[A-Za-z0-9._-]{8,64}$/;

// Gives each request an ID for logs, support, and work it queues. A valid incoming X-Request-Id is kept.
export function requestContext(request: Request, response: Response, next: () => void) {
  const incoming = request.header("x-request-id");
  const requestId = incoming && acceptedId.test(incoming) ? incoming : randomUUID();
  response.setHeader("X-Request-Id", requestId);
  storage.run({ requestId }, next);
}

export function currentRequestId() {
  return storage.getStore()?.requestId;
}
