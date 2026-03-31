import { Database } from 'bun:sqlite';
import type { Message } from './types';

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        toolCallId TEXT,
        toolCalls TEXT,
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      )
    `);
  }

  create(title: string): Session {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: Session = { id, title, createdAt: now, updatedAt: now };
    this.db.run(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
      [id, title, now, now],
    );
    return session;
  }

  addMessage(sessionId: string, message: Message): void {
    const toolCalls = message.toolCalls ? JSON.stringify(message.toolCalls) : null;
    this.db.run(
      'INSERT INTO messages (sessionId, role, content, toolCallId, toolCalls) VALUES (?, ?, ?, ?, ?)',
      [sessionId, message.role, message.content, message.toolCallId ?? null, toolCalls],
    );
    this.db.run(
      'UPDATE sessions SET updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), sessionId],
    );
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.db.query(
      'SELECT role, content, toolCallId, toolCalls FROM messages WHERE sessionId = ? ORDER BY id ASC',
    ).all(sessionId) as Array<{ role: string; content: string; toolCallId: string | null; toolCalls: string | null }>;

    return rows.map(row => {
      const msg: Message = { role: row.role as Message['role'], content: row.content };
      if (row.toolCallId) msg.toolCallId = row.toolCallId;
      if (row.toolCalls) msg.toolCalls = JSON.parse(row.toolCalls);
      return msg;
    });
  }

  list(): Session[] {
    return this.db.query(
      'SELECT id, title, createdAt, updatedAt FROM sessions ORDER BY updatedAt DESC',
    ).all() as Session[];
  }

  get(id: string): Session | undefined {
    const row = this.db.query(
      'SELECT id, title, createdAt, updatedAt FROM sessions WHERE id = ?',
    ).get(id);
    return row == null ? undefined : (row as Session);
  }

  close(): void {
    this.db.close();
  }
}
