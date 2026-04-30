import {
  initDatabase,
  insertEvent,
  getFilterOptions,
  getRecentEvents,
  updateEventHITLResponse,
  getAllSessionNames,
  upsertSessionName,
  deleteSessionName,
} from './db';
import type {
  HookEvent,
  HumanInTheLoopResponse,
  SessionNameUpsertRequest,
} from './types';

// Initialize database
initDatabase();

// Store WebSocket clients
const wsClients = new Set<any>();

// ---------------------------------------------------------------------------
// Subagent attribution back-fill
// ---------------------------------------------------------------------------
//
// Real Claude Code emits the human-readable description + subagent_type only
// on the parent's PreToolUse with tool_name == "Agent". The matching
// SubagentStart event (and every downstream tool event from inside that
// subagent) carries `agent_id` + `agent_type` at the top level — but no
// description and no link back to the spawning Task call.
//
// To put the attribution badge on every event row we maintain two in-memory
// maps:
//
//   pendingAgentSpawns[session_id] — FIFO of recent PreToolUse "Agent" calls
//     captured on this parent session, each holding { subagent_type,
//     description, timestamp }. The next SubagentStart that arrives on the
//     same session pops the matching entry (by subagent_type) and inherits
//     its description.
//
//   agentInfo[session_id::agent_id] — once the SubagentStart links a
//     description to an agent_id, every subsequent tool event from that
//     subagent (PreToolUse, PostToolUse, etc.) inherits it.
//
// Entries are LRU-evicted to keep memory bounded under long-running servers.
// ---------------------------------------------------------------------------

interface PendingSpawn {
  subagent_type?: string;
  description?: string;
  timestamp: number;
}

interface AgentInfo {
  subagent_type?: string;
  description?: string;
}

const PENDING_SPAWN_TTL_MS = 5 * 60 * 1000; // forget 5min-old spawns
const MAX_PENDING_PER_SESSION = 32;
const MAX_AGENT_INFO_ENTRIES = 4096;

const pendingAgentSpawns = new Map<string, PendingSpawn[]>();
const agentInfo = new Map<string, AgentInfo>();

function agentKey(sessionId: string, agentId: string): string {
  return `${sessionId}::${agentId}`;
}

function evictOldestAgentInfo(): void {
  if (agentInfo.size <= MAX_AGENT_INFO_ENTRIES) return;
  // Maps preserve insertion order — drop the oldest 25% so we're not
  // re-evicting on every insert.
  const dropCount = Math.ceil(MAX_AGENT_INFO_ENTRIES * 0.25);
  let dropped = 0;
  for (const k of agentInfo.keys()) {
    agentInfo.delete(k);
    if (++dropped >= dropCount) break;
  }
}

function recordAgentSpawn(event: HookEvent): void {
  if (event.hook_event_type !== 'PreToolUse') return;
  const payload = event.payload || {};
  if (payload.tool_name !== 'Agent') return;

  const subagentType = event.subagent_type;
  const description = event.description;
  if (!subagentType && !description) return;

  // Spawn timestamps are wall-clock (server-side) so the TTL filter below
  // is robust to skewed event timestamps (e.g. backfilled events, replays).
  const list = pendingAgentSpawns.get(event.session_id) ?? [];
  list.push({
    subagent_type: subagentType,
    description,
    timestamp: Date.now(),
  });

  // Drop entries older than the TTL.
  const cutoff = Date.now() - PENDING_SPAWN_TTL_MS;
  const fresh = list.filter(s => s.timestamp >= cutoff);
  // Cap per-session list length so a parent that fires hundreds of Task
  // calls without their SubagentStarts ever arriving doesn't blow up memory.
  while (fresh.length > MAX_PENDING_PER_SESSION) fresh.shift();

  pendingAgentSpawns.set(event.session_id, fresh);
}

function backfillSubagentStart(event: HookEvent): void {
  // SubagentStart already carries agent_type from the hook (we lift it to
  // subagent_type in send_event.py). The description is what we need.
  if (event.hook_event_type !== 'SubagentStart') return;
  if (!event.agent_id) return;

  const list = pendingAgentSpawns.get(event.session_id);
  if (list && list.length > 0) {
    // Prefer the oldest spawn whose subagent_type matches; fall back to the
    // oldest spawn (FIFO) when nothing matches.
    let pickIndex = -1;
    if (event.subagent_type) {
      pickIndex = list.findIndex(s => s.subagent_type === event.subagent_type);
    }
    if (pickIndex < 0) pickIndex = 0;

    const spawn = list[pickIndex];
    list.splice(pickIndex, 1);
    if (list.length === 0) {
      pendingAgentSpawns.delete(event.session_id);
    } else {
      pendingAgentSpawns.set(event.session_id, list);
    }

    if (spawn) {
      if (!event.description && spawn.description) {
        event.description = spawn.description;
      }
      if (!event.subagent_type && spawn.subagent_type) {
        event.subagent_type = spawn.subagent_type;
      }
    }
  }

  // Cache for downstream tool events from this subagent.
  agentInfo.set(agentKey(event.session_id, event.agent_id), {
    subagent_type: event.subagent_type,
    description: event.description,
  });
  evictOldestAgentInfo();
}

function backfillSubagentToolEvent(event: HookEvent): void {
  // Any non-Agent event with an agent_id is a tool call from inside a
  // subagent. Inherit description / subagent_type from the cached info.
  if (!event.agent_id) return;
  const info = agentInfo.get(agentKey(event.session_id, event.agent_id));
  if (!info) return;
  if (!event.subagent_type && info.subagent_type) {
    event.subagent_type = info.subagent_type;
  }
  if (!event.description && info.description) {
    event.description = info.description;
  }
}

function applyAttributionEnrichment(event: HookEvent): void {
  // Order matters: a PreToolUse from inside a subagent (agent_id present)
  // should inherit info first, BEFORE we record any spawn it might be
  // making for further-nested subagents.
  backfillSubagentToolEvent(event);
  backfillSubagentStart(event);
  recordAgentSpawn(event);
}

// Helper function to send response to agent via WebSocket
async function sendResponseToAgent(
  wsUrl: string,
  response: HumanInTheLoopResponse
): Promise<void> {
  console.log(`[HITL] Connecting to agent WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    };

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isResolved) return;
        console.log('[HITL] WebSocket connection opened, sending response...');

        try {
          ws!.send(JSON.stringify(response));
          console.log('[HITL] Response sent successfully');

          // Wait longer to ensure message fully transmits before closing
          setTimeout(() => {
            cleanup();
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          }, 500);
        } catch (error) {
          console.error('[HITL] Error sending message:', error);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[HITL] WebSocket error:', error);
        cleanup();
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      };

      ws.onclose = () => {
        console.log('[HITL] WebSocket connection closed');
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!isResolved) {
          console.error('[HITL] Timeout sending response to agent');
          cleanup();
          isResolved = true;
          reject(new Error('Timeout sending response to agent'));
        }
      }, 5000);

    } catch (error) {
      console.error('[HITL] Error creating WebSocket:', error);
      cleanup();
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    }
  });
}

// Create Bun server with HTTP and WebSocket support
const server = Bun.serve({
  port: parseInt(process.env.SERVER_PORT || '4000'),
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // POST /events - Receive new events
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const event = (await req.json()) as HookEvent;

        // Validate required fields
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Back-fill subagent attribution before insertion so the persisted
        // row carries the description / subagent_type even when the hook
        // payload itself didn't (subagents only get description from the
        // parent's preceding Agent tool call — see notes above).
        applyAttributionEnrichment(event);

        // Insert event into database
        const savedEvent = insertEvent(event);
        
        // Broadcast to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            // Client disconnected, remove from set
            wsClients.delete(client);
          }
        });
        
        return new Response(JSON.stringify(savedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /events/filter-options - Get available filter options
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      const options = getFilterOptions();
      return new Response(JSON.stringify(options), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /events/recent - Get recent events
    if (url.pathname === '/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '300');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /events/:id/respond - Respond to HITL request
    if (url.pathname.match(/^\/events\/\d+\/respond$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2] ?? '0');

      try {
        const response = (await req.json()) as HumanInTheLoopResponse;
        response.respondedAt = Date.now();

        // Update event in database
        const updatedEvent = updateEventHITLResponse(id, response);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Send response to agent via WebSocket
        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try {
            await sendResponseToAgent(
              updatedEvent.humanInTheLoop.responseWebSocketUrl,
              response
            );
          } catch (error) {
            console.error('Failed to send response to agent:', error);
            // Don't fail the request if we can't reach the agent
          }
        }

        // Broadcast updated event to all connected clients
        const message = JSON.stringify({ type: 'event', data: updatedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing HITL response:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/session-names - List all custom session names
    if (url.pathname === '/api/session-names' && req.method === 'GET') {
      const names = getAllSessionNames();
      return new Response(JSON.stringify(names), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/session-names - Upsert a custom session name.
    // An empty / whitespace-only custom_name deletes the existing row.
    if (url.pathname === '/api/session-names' && req.method === 'POST') {
      try {
        const body = (await req.json()) as Partial<SessionNameUpsertRequest>;

        if (
          typeof body.session_id !== 'string' ||
          !body.session_id ||
          typeof body.source_app !== 'string' ||
          !body.source_app ||
          typeof body.custom_name !== 'string'
        ) {
          return new Response(
            JSON.stringify({ error: 'Missing or invalid fields: session_id, source_app, custom_name' }),
            {
              status: 400,
              headers: { ...headers, 'Content-Type': 'application/json' }
            }
          );
        }

        const trimmed = body.custom_name.trim();

        if (trimmed.length === 0) {
          // Empty name — clear any existing alias for this session.
          const removed = deleteSessionName(body.session_id, body.source_app);
          return new Response(
            JSON.stringify({
              session_id: body.session_id,
              source_app: body.source_app,
              custom_name: '',
              deleted: removed,
            }),
            { headers: { ...headers, 'Content-Type': 'application/json' } }
          );
        }

        // Cap length to keep card headers readable. 80 chars is generous —
        // anything longer would blow out the card layout anyway.
        const safeName = trimmed.slice(0, 80);
        const saved = upsertSessionName(body.session_id, body.source_app, safeName);

        return new Response(JSON.stringify(saved), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error upserting session name:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // WebSocket upgrade
    if (url.pathname === '/stream') {
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
    }
    
    // Default response
    return new Response('Multi-Agent Observability Server', {
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  },
  
  websocket: {
    open(ws) {
      console.log('WebSocket client connected');
      wsClients.add(ws);
      
      // Send recent events on connection
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: 'initial', data: events }));
    },
    
    message(ws, message) {
      // Handle any client messages if needed
      console.log('Received message:', message);
    },
    
    close(ws) {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    }
    // Note: Bun's WebSocketHandler has no `error` callback. Errors surface
    // to the `close` handler with a non-1000 close code; that's enough for
    // this lightweight broadcaster.
  }
});

console.log(`🚀 Server running on http://localhost:${server.port}`);
console.log(`📊 WebSocket endpoint: ws://localhost:${server.port}/stream`);
console.log(`📮 POST events to: http://localhost:${server.port}/events`);