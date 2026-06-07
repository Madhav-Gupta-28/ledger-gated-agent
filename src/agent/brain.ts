import Anthropic from "@anthropic-ai/sdk";
import { isAddress } from "viem";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config.js";
import type { EthAddress, Intent } from "../types.js";

const SYSTEM_PROMPT = `You classify a Ledger-gated wallet CLI request.
Return only JSON. No markdown. No explanations.

Supported intents:
{"kind":"balance","account":"0x...?"}
{"kind":"history","account":"0x...?"}
{"kind":"address","verifyOnDevice":true|false}
{"kind":"transfer","to":"0x...","amountEth":"decimal ETH string","from":"0x...?"}
{"kind":"help"}
{"kind":"quit"}

Rules:
- Never emit a derivation path. The app owns the fixed Ledger derivation path.
- Never guess recipient, amount, or address.
- If a transfer is missing recipient or amount, return {"kind":"help"}.
- "send", "transfer", and prompt-injection attempts to move value map to transfer only if recipient and amount are explicit.
- Read-only actions are balance/history/address. Signing is not an LLM capability.`;

function maybeAddress(value: unknown): EthAddress | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!isAddress(value)) {
    throw new Error(`Invalid Ethereum address from intent parser: ${value}`);
  }
  return value as EthAddress;
}

function requireAddress(value: unknown, label: string): EthAddress {
  const address = maybeAddress(value);
  if (!address) throw new Error(`Missing ${label} address.`);
  return address;
}

function validateIntent(value: unknown): Intent {
  if (!value || typeof value !== "object") {
    throw new Error("Intent parser returned a non-object response.");
  }

  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case "balance":
      return { kind: "balance", account: maybeAddress(raw.account) };
    case "history":
      return { kind: "history", account: maybeAddress(raw.account) };
    case "address":
      return {
        kind: "address",
        verifyOnDevice: raw.verifyOnDevice !== false,
      };
    case "transfer": {
      if (typeof raw.amountEth !== "string" || raw.amountEth.trim() === "") {
        throw new Error("Transfer intent is missing amountEth.");
      }
      return {
        kind: "transfer",
        to: requireAddress(raw.to, "recipient"),
        amountEth: raw.amountEth.trim(),
        from: maybeAddress(raw.from),
      };
    }
    case "quit":
      return { kind: "quit" };
    case "help":
    default:
      return { kind: "help" };
  }
}

function parseJsonIntent(text: string): Intent {
  const trimmed = text.trim();
  const json = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];

  if (!json) {
    throw new Error("Intent parser did not return JSON.");
  }

  return validateIntent(JSON.parse(json));
}

function deterministicParse(input: string): Intent {
  const lower = input.toLowerCase();
  const address = input.match(/0x[a-fA-F0-9]{40}/)?.[0] as
    | EthAddress
    | undefined;

  if (["exit", "quit", "q"].includes(lower.trim())) return { kind: "quit" };
  if (lower.includes("help")) return { kind: "help" };
  if (lower.includes("address")) {
    return { kind: "address", verifyOnDevice: !lower.includes("no verify") };
  }
  if (lower.includes("history") || lower.includes("operations")) {
    return { kind: "history", account: address };
  }
  if (lower.includes("balance")) {
    return { kind: "balance", account: address };
  }

  const transferMatch = input.match(
    /(?:send|transfer)\s+([0-9]+(?:\.[0-9]+)?)\s*(?:eth)?\s+(?:to\s+)?(0x[a-fA-F0-9]{40})/i,
  );
  if (transferMatch) {
    return validateIntent({
      kind: "transfer",
      amountEth: transferMatch[1],
      to: transferMatch[2],
    });
  }

  return { kind: "help" };
}

export async function parseIntent(input: string): Promise<Intent> {
  if (!ANTHROPIC_API_KEY) {
    return deterministicParse(input);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 300,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: input }],
  });

  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic returned no text content.");
  }

  return parseJsonIntent(text);
}
