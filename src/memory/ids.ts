// ids.ts
import { v5 as uuidv5 } from "uuid";

// Pick a fixed namespace for your app (any valid UUID). Generate once and hardcode.
const MOVESIA_NS = "6c3a1e19-bf4a-4a18-8f6b-8e1ddc3d1a1e";

export function makePointIdFromChunkKey(chunkKey: string): string {
  // chunkKey can be your current "C:\...\jkl.cs#1-7#1916a3ae"
  return uuidv5(chunkKey, MOVESIA_NS); // returns a UUID string
}
