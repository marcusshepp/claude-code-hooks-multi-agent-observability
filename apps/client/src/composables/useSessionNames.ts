import { ref, onMounted } from 'vue';
import type { SessionName } from '../types';
import { API_BASE_URL } from '../config';

// Lookup key for the local map. The same short hash could collide across
// machines or projects, so we always namespace by source_app.
function nameKey(session_id: string, source_app: string): string {
  return `${source_app}::${session_id}`;
}

/**
 * Fetches and mutates the server-side `session_names` table.
 *
 * Exposes a reactive `Map<key, customName>` keyed by `${source_app}::${session_id}`,
 * a `getName(session_id, source_app)` lookup helper, and `renameSession(...)`
 * which POSTs to the server and updates the local map optimistically.
 *
 * Errors during rename roll the local map back to the previous value so
 * the UI never silently shows a stale rename.
 */
export function useSessionNames() {
  const namesMap = ref<Map<string, string>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);

  const refresh = async (): Promise<void> => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/session-names`);
      if (!res.ok) {
        throw new Error(`Failed to load session names (${res.status})`);
      }
      const rows = (await res.json()) as SessionName[];
      const next = new Map<string, string>();
      for (const row of rows) {
        if (row.custom_name && row.custom_name.length > 0) {
          next.set(nameKey(row.session_id, row.source_app), row.custom_name);
        }
      }
      namesMap.value = next;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('useSessionNames.refresh failed:', err);
      error.value = message;
    } finally {
      loading.value = false;
    }
  };

  const getName = (session_id: string, source_app: string): string | undefined => {
    return namesMap.value.get(nameKey(session_id, source_app));
  };

  /**
   * Optimistically update the local map then POST to the server. On error,
   * roll back to the previous value so the UI stays consistent with the
   * server. An empty / whitespace-only `custom_name` clears the alias.
   */
  const renameSession = async (
    session_id: string,
    source_app: string,
    custom_name: string
  ): Promise<void> => {
    const key = nameKey(session_id, source_app);
    const previous = namesMap.value.get(key);
    const trimmed = custom_name.trim();

    // Optimistic update — reactivity requires a fresh Map reference.
    const next = new Map(namesMap.value);
    if (trimmed.length === 0) {
      next.delete(key);
    } else {
      next.set(key, trimmed);
    }
    namesMap.value = next;

    try {
      const res = await fetch(`${API_BASE_URL}/api/session-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, source_app, custom_name: trimmed }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save session name (${res.status})`);
      }
    } catch (err: unknown) {
      // Roll back on failure.
      const rollback = new Map(namesMap.value);
      if (previous === undefined) {
        rollback.delete(key);
      } else {
        rollback.set(key, previous);
      }
      namesMap.value = rollback;

      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('useSessionNames.renameSession failed:', err);
      error.value = message;
      throw err;
    }
  };

  onMounted(() => {
    refresh();
  });

  return {
    namesMap,
    loading,
    error,
    refresh,
    getName,
    renameSession,
  };
}
