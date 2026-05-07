import { Database } from 'bun:sqlite';

export interface Automation {
  id: string;
  name: string;
  schedule: string;
  task: string;
  enabled: boolean;
  conversationId?: string;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
}

interface Row {
  id: string;
  name: string;
  schedule: string;
  task: string;
  enabled: number;
  conversation_id: string | null;
  last_run_at: number | null;
  next_run_at: number;
  created_at: number;
}

export class AutomationStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        task TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        conversation_id TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_automations_next_run ON automations(enabled, next_run_at)');
  }

  insert(a: Automation): void {
    this.db.run(
      `INSERT INTO automations (id, name, schedule, task, enabled, conversation_id, last_run_at, next_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.name, a.schedule, a.task, a.enabled ? 1 : 0,
       a.conversationId ?? null, a.lastRunAt?.getTime() ?? null,
       a.nextRunAt.getTime(), a.createdAt.getTime()],
    );
  }

  get(id: string): Automation | undefined {
    const row = this.db.query('SELECT * FROM automations WHERE id = ?').get(id) as Row | null;
    return row ? this.rowToAutomation(row) : undefined;
  }

  list(enabledOnly = false): Automation[] {
    const sql = enabledOnly
      ? 'SELECT * FROM automations WHERE enabled = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM automations ORDER BY created_at DESC';
    return (this.db.query(sql).all() as Row[]).map(r => this.rowToAutomation(r));
  }

  due(now: number): Automation[] {
    const rows = this.db.query(
      'SELECT * FROM automations WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC',
    ).all(now) as Row[];
    return rows.map(r => this.rowToAutomation(r));
  }

  setRun(id: string, lastRunAt: Date, nextRunAt: Date): void {
    this.db.run(
      'UPDATE automations SET last_run_at = ?, next_run_at = ? WHERE id = ?',
      [lastRunAt.getTime(), nextRunAt.getTime(), id],
    );
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.db.run('UPDATE automations SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM automations WHERE id = ?', [id]);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private rowToAutomation(row: Row): Automation {
    return {
      id: row.id,
      name: row.name,
      schedule: row.schedule,
      task: row.task,
      enabled: row.enabled === 1,
      conversationId: row.conversation_id ?? undefined,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: new Date(row.next_run_at),
      createdAt: new Date(row.created_at),
    };
  }
}
