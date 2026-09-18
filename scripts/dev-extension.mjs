#!/usr/bin/env node
/**
 * Watch source files and rebuild dist/ for unpacked extension development.
 * After the first Load unpacked, saves auto-reload the extension + active tab.
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");
const RELOAD_PORT = 5179;

const env = {
  ...process.env,
  VITE_KEEP_DIST: "1",
  NODE_ENV: "development",
};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyExtFiles() {
  await mkdir(distDir, { recursive: true });
  await cp(
    path.join(publicDir, "offscreen.html"),
    path.join(distDir, "offscreen.html")
  );
  await cp(
    path.join(publicDir, "offscreen.js"),
    path.join(distDir, "offscreen.js")
  );

  const background = await readFile(
    path.join(publicDir, "background.js"),
    "utf8"
  );
  const reloadClient = await readFile(
    path.join(__dirname, "background-dev-reload.js"),
    "utf8"
  );
  await writeFile(
    path.join(distDir, "background.js"),
    `${background}\n${reloadClient}`
  );

  const icon = path.join(publicDir, "icon.png");
  if (await exists(icon)) {
    await cp(icon, path.join(distDir, "icon.png"));
  }

  const iconsDir = path.join(publicDir, "icons");
  if (await exists(iconsDir)) {
    await mkdir(path.join(distDir, "icons"), { recursive: true });
    await cp(iconsDir, path.join(distDir, "icons"), { recursive: true });
  }

  await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/copy-manifest.mjs"], {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`copy-manifest.mjs exited with code ${code}`));
    });
  });
}

function run(cmd, args, label) {
  const child = spawn(cmd, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code !== 0 && code !== null) {
      console.error(`[dev:ext] ${label} exited with code ${code}`);
      process.exit(code);
    }
  });
  return child;
}

const waiters = new Map();

function broadcastReload() {
  for (const [res, timer] of waiters) {
    clearTimeout(timer);
    try {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end("reload");
    } catch {
      /* already closed */
    }
  }
  waiters.clear();
}

function startReloadServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.url !== "/wait") {
      res.writeHead(204);
      res.end();
      return;
    }

    const timer = setTimeout(() => {
      waiters.delete(res);
      try {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
        });
        res.end("idle");
      } catch {
        /* already closed */
      }
    }, 25000);

    req.on("close", () => {
      clearTimeout(timer);
      waiters.delete(res);
    });

    waiters.set(res, timer);
  });

  server.listen(RELOAD_PORT, "127.0.0.1", () => {
    console.log(`[dev:ext] Reload server on http://127.0.0.1:${RELOAD_PORT}`);
  });

  return server;
}

let copyTimer = null;
function scheduleCopy() {
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(async () => {
    copyTimer = null;
    await copyExtFiles();
    console.log("[dev:ext] Copied public/ → dist/");
  }, 80);
}

const children = [];
let reloadServer;

function shutdown() {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  reloadServer?.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`
[dev:ext] Syncle — extension watch + auto-reload
────────────────────────────────────────────────
  Load unpacked from dist/ once (chrome://extensions).
  After that, save a file — Chrome reloads the extension
  and the active http(s) tab. Re-open the popup if it was open.

  npm run dev is popup-only in the browser; it does not update
  the installed extension. Use this script instead.

  Press Ctrl+C to stop.
`);

await rm(distDir, { recursive: true, force: true });
await copyExtFiles();
reloadServer = startReloadServer();

children.push(
  run("npx", ["vite", "build", "--watch"], "popup"),
  run(
    "npx",
    ["vite", "build", "--config", "vite.content.config.js", "--watch"],
    "content"
  )
);

watch(publicDir, { recursive: true }, scheduleCopy);

let reloadReady = false;
let reloadTimer = null;
setTimeout(() => {
  reloadReady = true;
  console.log("[dev:ext] Auto-reload armed");
}, 8000);

watch(distDir, { recursive: true }, (_event, filename) => {
  if (!reloadReady) return;
  if (filename?.endsWith(".map")) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    console.log(`[dev:ext] dist/ changed (${filename ?? "unknown"}) — reload`);
    broadcastReload();
  }, 500);
});
