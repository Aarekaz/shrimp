import type { Agent } from "agents";
import { z } from "zod";
import type { Env } from "../env";

export type ApprovalLevel = "auto" | "notify" | "approve" | "never";

export interface CloudToolResult {
  title: string;
  output: unknown;
}

export interface CloudTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  approvalLevel: ApprovalLevel;
  isReadOnly: boolean;
  handler: (input: Record<string, unknown>, agent: Agent<Env, unknown>) => Promise<CloudToolResult>;
}

export function zodToSimpleJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToSimpleJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  return {};
}
