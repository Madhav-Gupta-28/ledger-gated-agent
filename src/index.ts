import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { SPECULOS_URL } from "./config.js";
import { parseIntent } from "./agent/brain.js";
import { route } from "./agent/router.js";
import { closeSession, openSession } from "./dmk/session.js";
import type { Intent } from "./types.js";

let activeSessionId: string | undefined;
let isCleaningUp = false;

async function getSession(): Promise<string> {
  if (activeSessionId) return activeSessionId;

  process.stderr.write(`Connecting to Speculos Ledger at ${SPECULOS_URL}...\n`);
  activeSessionId = await openSession();
  process.stderr.write("Connected to Ledger session.\n");
  return activeSessionId;
}

async function cleanup(exitCode = 0): Promise<never> {
  if (isCleaningUp) process.exit(exitCode);
  isCleaningUp = true;

  if (activeSessionId) {
    try {
      await closeSession(activeSessionId);
      process.stderr.write("Disconnected Ledger session.\n");
    } catch (error) {
      process.stderr.write(`Ledger disconnect failed: ${(error as Error).message}\n`);
    }
  }

  process.exit(exitCode);
}

async function handlePrompt(prompt: string): Promise<Intent> {
  const intent = await parseIntent(prompt);
  const message = await route(intent, getSession);
  console.log(message);
  return intent;
}

async function runOneShot(prompt: string): Promise<void> {
  const intent = await handlePrompt(prompt);
  if (intent.kind === "quit") {
    await cleanup(0);
  }
}

async function runRepl(): Promise<void> {
  console.log("ledger-gated-agent");
  console.log("Agent proposes. Ledger device disposes.");
  console.log("Type help for commands, quit to exit.\n");

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) continue;

      try {
        const intent = await handlePrompt(line);
        if (intent.kind === "quit") break;
      } catch (error) {
        console.error((error as Error).message);
      }
    }
  } finally {
    rl.close();
    await cleanup(0);
  }
}

process.on("SIGINT", () => {
  void cleanup(130);
});
process.on("SIGTERM", () => {
  void cleanup(143);
});

const prompt = process.argv.slice(2).join(" ").trim();

try {
  if (prompt) {
    await runOneShot(prompt);
    await cleanup(0);
  } else {
    await runRepl();
  }
} catch (error) {
  console.error((error as Error).message);
  await cleanup(1);
}
