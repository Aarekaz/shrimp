import { Database } from 'bun:sqlite';

export interface Procedure {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  createdAt: Date;
  usedCount: number;
  lastUsedAt: Date;
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
        lastUsedAt TEXT NOT NULL
      )
    `);
  }

  save(procedure: Procedure): void {
    this.db.run(
      'INSERT OR REPLACE INTO procedures (id, name, trigger, steps, createdAt, usedCount, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [procedure.id, procedure.name, procedure.trigger, JSON.stringify(procedure.steps), procedure.createdAt.toISOString(), procedure.usedCount, procedure.lastUsedAt.toISOString()],
    );
  }

  findByTrigger(query: string): Procedure | undefined {
    const row = this.db.query(
      'SELECT * FROM procedures WHERE trigger LIKE ? ORDER BY usedCount DESC LIMIT 1',
    ).get(`%${query}%`) as any;
    if (!row) return undefined;
    return { ...row, steps: JSON.parse(row.steps), createdAt: new Date(row.createdAt), lastUsedAt: new Date(row.lastUsedAt) };
  }

  incrementUsage(id: string): void {
    this.db.run(
      'UPDATE procedures SET usedCount = usedCount + 1, lastUsedAt = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  }

  list(): Procedure[] {
    const rows = this.db.query('SELECT * FROM procedures ORDER BY usedCount DESC').all() as any[];
    return rows.map(r => ({ ...r, steps: JSON.parse(r.steps), createdAt: new Date(r.createdAt), lastUsedAt: new Date(r.lastUsedAt) }));
  }

  close(): void { this.db.close(); }
}
