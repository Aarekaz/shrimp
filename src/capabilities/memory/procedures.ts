import { Database } from 'bun:sqlite';

// A procedure with this many demerits is considered poisoned and skipped on recall.
export const DEMERIT_THRESHOLD = 2;

export interface Procedure {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  createdAt: Date;
  usedCount: number;
  lastUsedAt: Date;
  demerits: number;
}

function rowToProcedure(row: any): Procedure {
  return {
    ...row,
    steps: JSON.parse(row.steps),
    createdAt: new Date(row.createdAt),
    lastUsedAt: new Date(row.lastUsedAt),
    demerits: row.demerits ?? 0,
  };
}

export class ProcedureStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS procedures (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        steps TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        usedCount INTEGER DEFAULT 0,
        lastUsedAt TEXT NOT NULL,
        demerits INTEGER DEFAULT 0
      )
    `);
    // For DBs created before demerits existed.
    try {
      this.db.run('ALTER TABLE procedures ADD COLUMN demerits INTEGER DEFAULT 0');
    } catch {
      // Column already present.
    }
  }

  save(procedure: Procedure): void {
    this.db.run(
      'INSERT OR REPLACE INTO procedures (id, name, trigger, steps, createdAt, usedCount, lastUsedAt, demerits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [procedure.id, procedure.name, procedure.trigger, JSON.stringify(procedure.steps), procedure.createdAt.toISOString(), procedure.usedCount, procedure.lastUsedAt.toISOString(), procedure.demerits ?? 0],
    );
  }

  findByTrigger(query: string): Procedure | undefined {
    return this.findCandidatesByTrigger(query, 1)[0];
  }

  findCandidatesByTrigger(query: string, limit = 5): Procedure[] {
    const rows = this.db.query(
      'SELECT * FROM procedures WHERE trigger LIKE ? AND demerits < ? ORDER BY usedCount DESC LIMIT ?',
    ).all(`%${query}%`, DEMERIT_THRESHOLD, limit) as any[];
    return rows.map(rowToProcedure);
  }

  incrementUsage(id: string): void {
    this.db.run(
      'UPDATE procedures SET usedCount = usedCount + 1, lastUsedAt = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  }

  demerit(id: string): boolean {
    const result = this.db.run(
      'UPDATE procedures SET demerits = demerits + 1 WHERE id = ?',
      [id],
    );
    return (result.changes ?? 0) > 0;
  }

  list(): Procedure[] {
    const rows = this.db.query('SELECT * FROM procedures ORDER BY usedCount DESC').all() as any[];
    return rows.map(rowToProcedure);
  }

  close(): void { this.db.close(); }
}
