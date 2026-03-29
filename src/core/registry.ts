import type { Capability, Tool } from './types';

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
}
