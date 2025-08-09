// memory/chunker.ts
import fs from "node:fs/promises";
import path from "node:path";

export type Chunk = {
    id: string;                // path#lineStart-lineEnd#hash
    path: string;
    kind: "Script" | "Scene";
    text: string;
    line_start: number;
    line_end: number;
    hash: string;
};

function hashString(s: string) {
    // lightweight non-crypto hash
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0;
    return h.toString(16);
}

export async function chunkFile(absPath: string, kind: "Script" | "Scene", targetTokens = 500, overlapLines = 20): Promise<Chunk[]> {
    const text = await fs.readFile(absPath, "utf8");
    const lines = text.split(/\r?\n/);
    const approxTokPerLine = 4; // rough
    const linesPerChunk = Math.max(30, Math.floor(targetTokens / approxTokPerLine));

    const out: Chunk[] = [];
    let i = 0;
    while (i < lines.length) {
        const start = i;
        const end = Math.min(lines.length, i + linesPerChunk);
        const chunkText = lines.slice(start, end).join("\n");
        const hash = hashString(chunkText);
        out.push({
            id: `${absPath}#L${start + 1}-${end}#${hash}`,
            path: absPath.split(path.sep).join("/"),
            kind,
            text: chunkText,
            line_start: start + 1,
            line_end: end,
            hash,
        });
        if (end >= lines.length) break;
        i = Math.max(end - overlapLines, start + 1);
    }
    return out;
}
