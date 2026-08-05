import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const openAIKeychainService =
  process.env.TRY_ME_OPENAI_KEYCHAIN_SERVICE ?? "com.0xtrey.folloze-try-me-now.openai";
const brandfetchKeychainService =
  process.env.TRY_ME_BRANDFETCH_KEYCHAIN_SERVICE ?? "com.0xtrey.folloze-try-me-now.brandfetch";
const brandfetchClientKeychainService =
  process.env.TRY_ME_BRANDFETCH_CLIENT_KEYCHAIN_SERVICE ?? "com.0xtrey.folloze-try-me-now.brandfetch-client";
const keychainAccount = process.env.USER;

if (!keychainAccount) {
  console.error("Unable to resolve the current macOS account for Keychain lookup.");
  process.exit(1);
}

const readCredential = (service) => {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", keychainAccount, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    return "";
  }
};

let apiKey = readCredential(openAIKeychainService);
let brandfetchApiKey = readCredential(brandfetchKeychainService);
let brandfetchClientId = readCredential(brandfetchClientKeychainService);
if (!apiKey) {
  console.error(
    `No OpenAI credential was found in macOS Keychain for service ${openAIKeychainService}.`
  );
  process.exit(1);
}

if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  console.error("The Keychain item does not contain a recognizable OpenAI API key.");
  process.exit(1);
}
if (brandfetchApiKey && !/^[A-Za-z0-9_-]{60,}$/.test(brandfetchApiKey)) {
  console.error("The Brandfetch Keychain item is not a recognizable Brand API key.");
  process.exit(1);
}
if (brandfetchClientId && !/^[A-Za-z0-9_-]{8,80}$/.test(brandfetchClientId)) {
  console.error("The Brandfetch client Keychain item is not a recognizable client ID.");
  process.exit(1);
}

const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawn(process.execPath, [nextBin.pathname, "dev", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    OPENAI_API_KEY: apiKey,
    GENERATION_MODE: "openai",
    ...(brandfetchApiKey ? { BRANDFETCH_API_KEY: brandfetchApiKey } : {}),
    ...(brandfetchClientId ? { BRANDFETCH_CLIENT_ID: brandfetchClientId } : {}),
    BRANDFETCH_MODE: process.env.BRANDFETCH_MODE ?? (brandfetchClientId ? "logo" : "disabled")
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
  brandfetchApiKey = "";
  brandfetchClientId = "";
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
