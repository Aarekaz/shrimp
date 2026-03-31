import type { Capability, Tool, LLMTool } from './types';
import { z } from 'zod';

// Converts a single Zod field to a JSON Schema property object
function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodString) return { type: 'string' };
  if (field instanceof z.ZodNumber) return { type: 'number' };
  if (field instanceof z.ZodBoolean) return { type: 'boolean' };
  if (field instanceof z.ZodEnum) return { type: 'string', enum: field.options as string[] };
  if (field instanceof z.ZodArray) return { type: 'array', items: zodFieldToJsonSchema(field.element) };
  if (field instanceof z.ZodOptional) return zodFieldToJsonSchema(field.unwrap());
  if (field instanceof z.ZodObject) return zodToJsonSchema(field);
  return {};
}

// Converts a ZodObject to a JSON Schema object
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodFieldToJsonSchema(value as z.ZodTypeAny);
    if (!(value instanceof z.ZodOptional)) {
      required.push(key);
    }
  }

  const result: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}

export class CapabilityRegistry {
  private capabilities = new Map<string, Capability>();
  private toolIndex = new Map<string, Tool>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`Capability "${capability.name}" is already registered`);
    }
    this.capabilities.set(capability.name, capability);
    for (const tool of capability.tools) {
      this.toolIndex.set(tool.name, tool);
    }
  }

  get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  resolveTool(name: string): Tool | undefined {
    return this.toolIndex.get(name);
  }

  allTools(): Tool[] {
    return Array.from(this.toolIndex.values());
  }

  allToolsForLLM(): LLMTool[] {
    return Array.from(this.toolIndex.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.rawInputSchema ?? zodToJsonSchema(tool.parameters as z.ZodObject<z.ZodRawShape>),
    }));
  }
}
