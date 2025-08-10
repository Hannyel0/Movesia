// memory/embedder.ts
import type { Tensor } from '@xenova/transformers';
import { pipeline } from '@xenova/transformers';

export class LocalEmbedder {
  public readonly dim = 384;
  private extractorPromise = pipeline(
    'feature-extraction',
    'Xenova/bge-small-en-v1.5' // 384-d model
  ); // downloads & caches on first use

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    
    console.log(`🔤 Embedding ${texts.length} text chunks with BGE-small-en-v1.5...`);
    const startTime = Date.now();
    
    const extractor = await this.extractorPromise;

    // Get sentence embeddings with mean pooling + L2 normalization
    const out = await extractor(texts, { pooling: 'mean', normalize: true }) as Tensor;
    const [n, d] = out.dims; // e.g., [N, 384]
    if (d !== this.dim) throw new Error(`Embedder dim ${d} != expected ${this.dim}`);

    const arr = out.data as Float32Array;
    const result: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = arr.subarray(i * d, (i + 1) * d);
      // Quick zero-vector guard (shouldn't trigger)
      let mag = 0;
      for (let j = 0; j < d; j++) mag += Math.abs(row[j]);
      if (mag < 1e-8) throw new Error('Zero/near-zero embedding produced');
      result[i] = Array.from(row);
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Embedded ${texts.length} chunks in ${duration}ms (${Math.round(duration/texts.length)}ms/chunk)`);
    
    return result;
  }
}
