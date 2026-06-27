export interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WorkersAITextResult {
  text: string;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["response", "text", "output_text", "content"]) {
    if (typeof record[key] === "string") return record[key];
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first?.text;
    const extracted = extractText(content);
    if (extracted) return extracted;
  }

  const output = record.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const extracted = extractText(item);
      if (extracted) return extracted;
    }
  }
  if (output) {
    const extracted = extractText(output);
    if (extracted) return extracted;
  }

  const result = record.result;
  if (result) {
    const extracted = extractText(result);
    if (extracted) return extracted;
  }

  return "";
}

export async function generateWithWorkersAI(
  ai: Ai,
  model: string,
  messages: WorkersAIMessage[],
): Promise<WorkersAITextResult> {
  const result = await ai.run(model, { messages });
  return { text: extractText(result) };
}
