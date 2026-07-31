import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const keychainService =
  process.env.TRY_ME_OPENAI_KEYCHAIN_SERVICE ?? "com.0xtrey.folloze-try-me-now.openai";
const keychainAccount = process.env.USER;

if (!keychainAccount) {
  console.error("Unable to resolve the current macOS account for Keychain lookup.");
  process.exit(1);
}

let apiKey = "";
try {
  apiKey = execFileSync(
    "security",
    ["find-generic-password", "-a", keychainAccount, "-s", keychainService, "-w"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
} catch {
  console.error(
    `No OpenAI credential was found in macOS Keychain for service ${keychainService}.`
  );
  process.exit(1);
}

if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  console.error("The Keychain item does not contain a recognizable OpenAI API key.");
  process.exit(1);
}

const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawn(process.execPath, [nextBin.pathname, "dev", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    OPENAI_API_KEY: apiKey,
    GENERATION_MODE: "openai"
  },
  stdio: "inherit"
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.once("SIGINT", () => forward("SIGINT"));
process.once("SIGTERM", () => forward("SIGTERM"));
child.once("exit", (code, signal) => {
  apiKey = "";
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
