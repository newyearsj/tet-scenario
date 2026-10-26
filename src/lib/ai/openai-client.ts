import "server-only";
import OpenAI from "openai";

let client: OpenAI | undefined;

export class AiConfigurationError extends Error {
  constructor(public readonly missing: "OPENAI_API_KEY" | "OPENAI_MODEL") {
    super(`AI_CONFIGURATION_MISSING:${missing}`);
  }
}

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) throw new AiConfigurationError("OPENAI_API_KEY");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
}
