import { Sha256 } from "@aws-crypto/sha256-browser";

type ByteStream = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  if (typeof btoa === "function") {
    if (typeof TextDecoder === "function") {
      try {
        return btoa(new TextDecoder("latin1").decode(bytes));
      } catch {
        // Fallback below for environments without latin1 support.
      }
    }
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  throw new Error("Base64 encoding is not available in this environment.");
}

async function* toAsyncIterable(
  stream: ByteStream,
): AsyncIterable<Uint8Array> {
  if (Symbol.asyncIterator in stream) {
    yield* stream;
    return;
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function computeSha256Base64(
  stream: ByteStream,
): Promise<{ size: number; sha256: string }> {
  const hash = new Sha256();
  let size = 0;

  for await (const chunk of toAsyncIterable(stream)) {
    hash.update(chunk);
    size += chunk.byteLength;
  }

  const digest = await hash.digest();
  return {
    size,
    sha256: bytesToBase64(new Uint8Array(digest)),
  };
}

export async function computeBlobSha256Base64(blob: Blob): Promise<string> {
  if (typeof blob.stream === "function") {
    return (await computeSha256Base64(blob.stream())).sha256;
  }

  const hash = new Sha256();
  hash.update(new Uint8Array(await blob.arrayBuffer()));
  return bytesToBase64(new Uint8Array(await hash.digest()));
}

export async function computeResponseSha256Base64(response: Response) {
  if (response.body) {
    return computeSha256Base64(response.body);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = new Sha256();
  hash.update(bytes);
  return {
    size: bytes.byteLength,
    sha256: bytesToBase64(new Uint8Array(await hash.digest())),
  };
}
