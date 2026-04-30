import { Database } from 'bun:sqlite';
import type { HookEvent, FilterOptions, SessionName } from './types';

let db: Database;

export function initDatabase(): void {
  db = new Database('events.db');
  
  // Enable WAL mode for better concurrent performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  
  // Create events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      hook_event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      chat TEXT,
      summary TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  // Check if chat column exists, add it if not (for migration)
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all() as any[];
    const hasChatColumn = columns.some((col: any) => col.name === 'chat');
    if (!hasChatColumn) {
      db.exec('ALTER TABLE events ADD COLUMN chat TEXT');
    }

    // Check if summary column exists, add it if not (for migration)
    const hasSummaryColumn = columns.some((col: any) => col.name === 'summary');
    if (!hasSummaryColumn) {
      db.exec('ALTER TABLE events ADD COLUMN summary TEXT');
    }

    // Check if humanInTheLoop column exists, add it if not (for migration)
    const hasHumanInTheLoopColumn = columns.some((col: any) => col.name === 'humanInTheLoop');
    if (!hasHumanInTheLoopColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoop TEXT');
    }

    // Check if humanInTheLoopStatus column exists, add it if not (for migration)
    const hasHumanInTheLoopStatusColumn = columns.some((col: any) => col.name === 'humanInTheLoopStatus');
    if (!hasHumanInTheLoopStatusColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoopStatus TEXT');
    }

    // Check if model_name column exists, add it if not (for migration)
    const hasModelNameColumn = columns.some((col: any) => col.name === 'model_name');
    if (!hasModelNameColumn) {
      db.exec('ALTER TABLE events ADD COLUMN model_name TEXT');
    }

    // Subagent attribution columns. Default NULL — backwards compatible
    // with any event row that pre-dates this migration or any hook that
    // doesn't yet forward these fields.
    const hasSubagentTypeColumn = columns.some((col: any) => col.name === 'subagent_type');
    if (!hasSubagentTypeColumn) {
      db.exec('ALTER TABLE events ADD COLUMN subagent_type TEXT');
    }

    const hasDescriptionColumn = columns.some((col: any) => col.name === 'description');
    if (!hasDescriptionColumn) {
      db.exec('ALTER TABLE events ADD COLUMN description TEXT');
    }

    const hasParentSessionIdColumn = columns.some((col: any) => col.name === 'parent_session_id');
    if (!hasParentSessionIdColumn) {
      db.exec('ALTER TABLE events ADD COLUMN parent_session_id TEXT');
    }

    // agent_id — Claude Code's per-subagent identifier, present at the
    // top level on SubagentStart/Stop and on every tool event fired from
    // inside a subagent. Together with session_id this is the durable
    // (parent_session, child_agent) pair that anchors attribution.
    const hasAgentIdColumn = columns.some((col: any) => col.name === 'agent_id');
    if (!hasAgentIdColumn) {
      db.exec('ALTER TABLE events ADD COLUMN agent_id TEXT');
    }
  } catch (error) {
    // If the table doesn't exist yet, the CREATE TABLE above will handle it
  }
  
  // Create indexes for common queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_source_app ON events(source_app)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_hook_event_type ON events(hook_event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_id ON events(agent_id)');

  // Session names — human-friendly aliases for raw session_id hashes.
  // Composite primary key on (session_id, source_app) because the same
  // short hash could collide across machines / projects; we always look
  // up by both. Idempotent CREATE TABLE — same migration pattern as the
  // events table above.
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_names (
      session_id TEXT NOT NULL,
      source_app TEXT NOT NULL,
      custom_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, source_app)
    )
  `);

  // Note: previous versions of this app maintained `themes`, `theme_shares`,
  // and `theme_ratings` tables. The dashboard is now hardcoded to a single
  // dark theme — those tables are obsolete and the CRUD endpoints have been
  // removed. We intentionally do NOT drop the legacy tables here so existing
  // events.db files can be opened without rewriting their on-disk schema; the
  // tables sit unused. To reclaim the space run `VACUUM` after `DROP TABLE`
  // manually if a fresh deploy.
}

export function insertEvent(event: HookEvent): HookEvent {
  const stmt = db.prepare(`
    INSERT INTO events (
      source_app, session_id, hook_event_type, payload, chat, summary,
      timestamp, humanInTheLoop, humanInTheLoopStatus, model_name,
      subagent_type, description, parent_session_id, agent_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const timestamp = event.timestamp || Date.now();

  // Initialize humanInTheLoopStatus to pending if humanInTheLoop exists
  let humanInTheLoopStatus = event.humanInTheLoopStatus;
  if (event.humanInTheLoop && !humanInTheLoopStatus) {
    humanInTheLoopStatus = { status: 'pending' };
  }

  const result = stmt.run(
    event.source_app,
    event.session_id,
    event.hook_event_type,
    JSON.stringify(event.payload),
    event.chat ? JSON.stringify(event.chat) : null,
    event.summary || null,
    timestamp,
    event.humanInTheLoop ? JSON.stringify(event.humanInTheLoop) : null,
    humanInTheLoopStatus ? JSON.stringify(humanInTheLoopStatus) : null,
    event.model_name || null,
    event.subagent_type || null,
    event.description || null,
    event.parent_session_id || null,
    event.agent_id || null
  );

  return {
    ...event,
    id: result.lastInsertRowid as number,
    timestamp,
    humanInTheLoopStatus
  };
}

export function getFilterOptions(): FilterOptions {
  const sourceApps = db.prepare('SELECT DISTINCT source_app FROM events ORDER BY source_app').all() as { source_app: string }[];
  const sessionIds = db.prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 300').all() as { session_id: string }[];
  const hookEventTypes = db.prepare('SELECT DISTINCT hook_event_type FROM events ORDER BY hook_event_type').all() as { hook_event_type: string }[];
  
  return {
    source_apps: sourceApps.map(row => row.source_app),
    session_ids: sessionIds.map(row => row.session_id),
    hook_event_types: hookEventTypes.map(row => row.hook_event_type)
  };
}

export function getRecentEvents(limit: number = 300): HookEvent[] {
  const stmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary,
           timestamp, humanInTheLoop, humanInTheLoopStatus, model_name,
           subagent_type, description, parent_session_id, agent_id
    FROM events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map(row => ({
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined,
    subagent_type: row.subagent_type || undefined,
    description: row.description || undefined,
    parent_session_id: row.parent_session_id || undefined,
    agent_id: row.agent_id || undefined
  })).reverse();
}

// HITL helper functions
export function updateEventHITLResponse(id: number, response: any): HookEvent | null {
  const status = {
    status: 'responded',
    respondedAt: response.respondedAt,
    response
  };

  const stmt = db.prepare('UPDATE events SET humanInTheLoopStatus = ? WHERE id = ?');
  stmt.run(JSON.stringify(status), id);

  const selectStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary,
           timestamp, humanInTheLoop, humanInTheLoopStatus, model_name,
           subagent_type, description, parent_session_id, agent_id
    FROM events
    WHERE id = ?
  `);
  const row = selectStmt.get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined,
    subagent_type: row.subagent_type || undefined,
    description: row.description || undefined,
    parent_session_id: row.parent_session_id || undefined,
    agent_id: row.agent_id || undefined
  };
}

// ---------------------------------------------------------------------------
// Session names
// ---------------------------------------------------------------------------

export function getAllSessionNames(): SessionName[] {
  const stmt = db.prepare(`
    SELECT session_id, source_app, custom_name, updated_at
    FROM session_names
    ORDER BY updated_at DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(row => ({
    session_id: row.session_id,
    source_app: row.source_app,
    custom_name: row.custom_name,
    updated_at: row.updated_at,
  }));
}

// Upsert a session's friendly name. Returns the saved row.
export function upsertSessionName(
  session_id: string,
  source_app: string,
  custom_name: string
): SessionName {
  const updated_at = Date.now();
  const stmt = db.prepare(`
    INSERT INTO session_names (session_id, source_app, custom_name, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, source_app) DO UPDATE SET
      custom_name = excluded.custom_name,
      updated_at = excluded.updated_at
  `);
  stmt.run(session_id, source_app, custom_name, updated_at);
  return { session_id, source_app, custom_name, updated_at };
}

// Delete a session's friendly name. Returns true if a row was removed.
export function deleteSessionName(session_id: string, source_app: string): boolean {
  const stmt = db.prepare(`
    DELETE FROM session_names
    WHERE session_id = ? AND source_app = ?
  `);
  const result = stmt.run(session_id, source_app);
  return (result.changes ?? 0) > 0;
}

export { db };