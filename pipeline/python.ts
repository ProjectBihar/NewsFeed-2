import { spawn } from "node:child_process";
import { resolve } from "node:path";

/** JSON stdin/stdout only. No shell, network, database access or model training. */
export function callWorker<T>(request: Record<string, unknown>): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const workerEnv = { ...process.env };
    delete workerEnv.DATABASE_URL;
    delete workerEnv.SUPABASE_SERVICE_ROLE_KEY;
    const child = spawn(process.env.PYTHON_BIN || "python", [resolve("pipeline/worker.py")], {
      cwd: process.cwd(),
      env: { ...workerEnv, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const timer = setTimeout(() => {
      child.kill();
    }, 60000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) {
        overflow = true;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.stdin.on("error", () => {
      /* exit handler reports premature worker termination */
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || overflow) {
        reject(
          new Error(
            overflow ? "Worker output exceeded its bound." : `Worker failed (${code}): ${stderr}`
          )
        );
      } else {
        try {
          resolvePromise(JSON.parse(stdout) as T);
        } catch {
          reject(
            new Error(
              `Worker returned invalid JSON (bytes=${Buffer.byteLength(stdout)}, leadingCodePoint=${stdout.codePointAt(0) ?? "empty"}, objectOffset=${stdout.indexOf("{")}).`
            )
          );
        }
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
