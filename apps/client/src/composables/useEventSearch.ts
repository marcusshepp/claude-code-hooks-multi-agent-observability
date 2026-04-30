import { ref, computed } from 'vue';
import type { HookEvent } from '../types';

export function useEventSearch() {
  const searchPattern = ref<string>('');
  const searchError = ref<string>('');

  // Validate regex pattern
  const validateRegex = (pattern: string): { valid: boolean; error?: string } => {
    if (!pattern || pattern.trim() === '') {
      return { valid: true };
    }

    try {
      new RegExp(pattern);
      return { valid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid regex pattern';
      return { valid: false, error: errorMessage };
    }
  };

  // Extract searchable text from event. The hook payload's tool input lives
  // under `event.payload`, not as flat fields on the event — pluck out the
  // common subkeys we want to grep over.
  const getSearchableText = (event: HookEvent): string => {
    const parts: string[] = [];

    if (event.hook_event_type) parts.push(event.hook_event_type);
    if (event.source_app) parts.push(event.source_app);
    if (event.session_id) parts.push(event.session_id);
    if (event.model_name) parts.push(event.model_name);
    if (event.summary) parts.push(event.summary);
    if (event.subagent_type) parts.push(event.subagent_type);
    if (event.description) parts.push(event.description);

    const payload = event.payload ?? {};

    if (typeof payload.tool_name === 'string') parts.push(payload.tool_name);

    const toolInput = payload.tool_input ?? {};
    if (typeof toolInput.command === 'string') parts.push(toolInput.command);
    if (typeof toolInput.file_path === 'string') parts.push(toolInput.file_path);
    if (typeof toolInput.pattern === 'string') parts.push(toolInput.pattern);
    if (typeof toolInput.url === 'string') parts.push(toolInput.url);
    if (typeof toolInput.query === 'string') parts.push(toolInput.query);
    if (typeof toolInput.prompt === 'string') parts.push(toolInput.prompt);
    if (typeof toolInput.description === 'string') parts.push(toolInput.description);
    if (typeof toolInput.subagent_type === 'string') parts.push(toolInput.subagent_type);

    if (event.humanInTheLoop?.question) parts.push(event.humanInTheLoop.question);

    return parts.join(' ').toLowerCase();
  };

  // Check if event matches pattern. Slow path: compiles regex per call —
  // intended for ad-hoc / single-event checks. Use `searchEvents` for any
  // batched filtering so the regex is compiled exactly once.
  const matchesPattern = (event: HookEvent, pattern: string): boolean => {
    if (!pattern || pattern.trim() === '') {
      return true;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      return false;
    }
    return regex.test(getSearchableText(event));
  };

  // Filter events by pattern. Compiles the regex once outside the hot loop;
  // with 300 events and a non-empty pattern, the previous per-event compile
  // burned an O(N) cost on every keystroke.
  const searchEvents = (events: HookEvent[], pattern: string): HookEvent[] => {
    if (!pattern || pattern.trim() === '') {
      return events;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      return events;
    }

    return events.filter(event => regex.test(getSearchableText(event)));
  };

  // Computed property for current error
  const hasError = computed(() => searchError.value.length > 0);

  // Update search pattern and validate
  const updateSearchPattern = (pattern: string) => {
    searchPattern.value = pattern;

    if (!pattern || pattern.trim() === '') {
      searchError.value = '';
      return;
    }

    const validation = validateRegex(pattern);
    if (!validation.valid) {
      searchError.value = validation.error || 'Invalid regex pattern';
    } else {
      searchError.value = '';
    }
  };

  // Clear search
  const clearSearch = () => {
    searchPattern.value = '';
    searchError.value = '';
  };

  return {
    searchPattern,
    searchError,
    hasError,
    validateRegex,
    matchesPattern,
    searchEvents,
    updateSearchPattern,
    clearSearch,
    getSearchableText
  };
}
