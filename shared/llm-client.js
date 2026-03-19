import fetch from "node-fetch";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required for llm-client.js");
}

/**
 * Make a single LLM call and return the raw text response.
 * Matches the fetch pattern used by the reporting server.
 * Default model is gemini-2.0-flash (free tier). Run scripts/set-model.sh to change.
 * Run scripts/set-model.sh MODEL_NAME to change the default across all files.
 * @param {string} prompt
 * @param {object} opts
 * @param {string}  opts.model        - Gemini model string. Defaults to gemini-2.0-flash (free tier).
 * @param {number}  opts.temperature  - 0.0–1.0. Defaults to 0.4.
 * @returns {Promise<string>}
 */
export async function llmCall(prompt, { model = "gemini-3-flash-preview", temperature = 0.4 } = {}) {
  const res = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature },
      }),
    }
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`llmCall: no text in response. Status ${res.status}. Body: ${JSON.stringify(data)}`);
  return text;
}

/**
 * Make an LLM call expecting a JSON response. Strips markdown fences before
 * parsing. Uses temperature 0.1 by default for deterministic structured output.
 * @param {string} prompt
 * @param {object} opts - Same options as llmCall. Temperature defaults to 0.1.
 * @returns {Promise<object|Array>}
 */
export async function llmJSON(prompt, opts = {}) {
  const raw = await llmCall(prompt, { temperature: 0.1, ...opts });
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`llmJSON parse failed. Raw response:\n${raw}\n\nParse error: ${e.message}`);
  }
}
