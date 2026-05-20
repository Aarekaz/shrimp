import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MemoryEntry } from '../../core/types';

export class SQLiteMemoryStore {
  private db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL
      )
    `);
  }

  async store(entry: MemoryEntry): Promise<void> {
    this.db.run(
      'INSERT OR REPLACE INTO memories (id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?)',
      [entry.id, entry.type, entry.content, entry.metadata ? JSON.stringify(entry.metadata) : null, entry.timestamp.toISOString()],
    );
  }

  async forget(id: string): Promise<void> {
    this.db.run('DELETE FROM memories WHERE id = ?', [id]);
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    // Substring match, ordered by recency
    const rows = this.db.query(
      'SELECT * FROM memories WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?',
    ).all(`%${query}%`, limit) as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  async search(query: string, k = 10): Promise<MemoryEntry[]> {
    // TF-IDF-like scoring: split query into words, count matches, rank
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return this.recall(query, k);

    const allRows = this.db.query('SELECT * FROM memories').all() as any[];

    const scored = allRows.map(row => {
      const content = row.content.toLowerCase();
      let score = 0;
      for (const word of words) {
        const matches = content.split(word).length - 1;
        score += matches;
      }
      return { row, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => this.rowToEntry(s.row));
  }

  async all(): Promise<MemoryEntry[]> {
    const rows = this.db.query('SELECT * FROM memories ORDER BY timestamp DESC').all() as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: new Date(row.timestamp),
    };
  }
}
