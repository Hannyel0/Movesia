// qdrant/ensure.ts (Electron main process)
import Docker from "dockerode";

import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";

// Configure Docker connection for Windows vs Unix
const docker = process.platform === "win32"
  ? new Docker({ socketPath: "//./pipe/docker_engine" })
  : new Docker({ socketPath: "/var/run/docker.sock" });

export async function ensureQdrantRunning(opts?: { apiKey?: string; port?: number }) {
    console.log("🐳 Starting Qdrant container setup...");
    
    // 1) Verify Docker is running
    console.log("🔍 Checking Docker availability...");
    try { 
        await docker.ping(); 
        console.log("✅ Docker is running");
    } catch {
        console.error("❌ Docker is not running. Please start Docker Desktop.");
        throw new Error("Docker is not running. Please start Docker Desktop.");
    }

    const name = "movesia-qdrant";
    const storageDir = path.join(app.getPath("userData"), "qdrant_storage");
    console.log(`📁 Creating storage directory: ${storageDir}`);
    await fs.mkdir(storageDir, { recursive: true });

    // 2) Ensure container exists (pull if missing)
    console.log(`🔍 Checking if container '${name}' exists...`);
    let container = docker.getContainer(name);
    let exists = true;
    try { 
        await container.inspect(); 
        console.log(`✅ Container '${name}' already exists`);
    } catch { 
        exists = false;
        console.log(`📦 Container '${name}' not found, will create it`);
    }

    if (!exists) {
        // Pull image
        console.log("📥 Pulling Qdrant Docker image (this may take a few minutes)...");
        await new Promise<void>((resolve, reject) =>
            docker.pull("qdrant/qdrant", (err: Error | null, stream: NodeJS.ReadableStream) => {
                if (err) {
                    console.error("❌ Failed to pull Qdrant image:", err.message);
                    return reject(err);
                }
                docker.modem.followProgress(stream!, (pullErr?: Error) => {
                    if (pullErr) {
                        console.error("❌ Error during image pull:", pullErr.message);
                        reject(pullErr);
                    } else {
                        console.log("✅ Qdrant image pulled successfully");
                        resolve();
                    }
                });
            })
        );

        // Create container
        console.log(`🔧 Creating container '${name}' with persistent storage...`);
        container = await docker.createContainer({
            name,
            Image: "qdrant/qdrant",
            Env: opts?.apiKey ? [`QDRANT__SERVICE__API_KEY=${opts.apiKey}`] : [],
            ExposedPorts: { "6333/tcp": {}, "6334/tcp": {} },
            HostConfig: {
                Binds: [`${storageDir}:/qdrant/storage`],       // persist data
                PortBindings: { "6333/tcp": [{ HostPort: "6333" }], "6334/tcp": [{ HostPort: "6334" }] },
                RestartPolicy: { Name: "unless-stopped" }
            }
        });
        console.log(`✅ Container '${name}' created successfully`);
    }

    // 3) Start (idempotent)
    console.log(`🚀 Starting container '${name}'...`);
    try { 
        await container.start(); 
        console.log(`✅ Container '${name}' started successfully`);
    } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        if (error.statusCode === 304) {
            console.log(`ℹ️  Container '${name}' was already running`);
        } else {
            console.error(`❌ Failed to start container '${name}':`, error.message);
            throw err;
        }
    }

    // 4) Wait for readiness (/readyz returns 200)
    console.log(`⏳ Waiting for Qdrant to be ready at http://127.0.0.1:6333...`);
    await waitForReadyz({ apiKey: opts?.apiKey });
    console.log(`🎉 Qdrant is ready! Container '${name}' is running and accessible at http://127.0.0.1:6333`);
}

function waitForReadyz({ apiKey, timeoutMs = 30_000 }: { apiKey?: string; timeoutMs?: number }) {
    const deadline = Date.now() + timeoutMs;
    return new Promise<void>((resolve, reject) => {
        const tick = () => {
            const req = http.request(
                { host: "127.0.0.1", port: 6333, path: "/readyz", method: "GET", headers: apiKey ? { "api-key": apiKey } : {} },
                (res) => {
                    if (res.statusCode === 200) return resolve();
                    res.resume();
                    Date.now() < deadline ? setTimeout(tick, 1000) : reject(new Error("Qdrant not ready"));
                }
            );
            req.on("error", () => Date.now() < deadline ? setTimeout(tick, 1000) : reject(new Error("Qdrant not reachable")));
            req.end();
        };
        tick();
    });
}
