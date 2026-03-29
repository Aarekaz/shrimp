import type { MemoryEntry } from '../../core/types';

export class WorkingMemory {
  private entries = new Map<string, MemoryEntry>();

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async forget(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.entries.values())
      .filter(e => e.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async search(query: string, k = 10): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.entries.values())
      .filter(e => e.content.toLowerCase().includes(lowerQuery))
      .slice(0, k);
  }

  async all(): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
  }
}
