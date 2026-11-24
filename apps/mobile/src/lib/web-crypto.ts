import * as ExpoCrypto from "expo-crypto";

// Sign-in links are protected with random values and SHA-256. Without these, the sign-in library falls back to weaker ones.
const current = globalThis.crypto as Crypto | undefined;
if (!current?.subtle || !current.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
    getRandomValues: ExpoCrypto.getRandomValues, randomUUID: ExpoCrypto.randomUUID,
    subtle: { digest: (_name: string, data: BufferSource) => ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data) },
  } });
}
