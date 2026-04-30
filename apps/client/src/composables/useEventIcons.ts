import type { Component } from 'vue';
import {
  Wrench,
  Check,
  X,
  Lock,
  Package,
  MessageSquare,
  Play,
  Square,
  GitBranch,
  GitMerge,
  Bell,
  CircleStop,
  Terminal,
  FileText,
  FilePlus2,
  FilePen,
  Files,
  Search,
  SearchCode,
  Globe,
  Users,
  ListChecks,
  BookOpen,
  Plug,
  CircleDot,
} from 'lucide-vue-next';

const eventTypeToIcon: Record<string, Component> = {
  PreToolUse: Wrench,
  PostToolUse: Check,
  PostToolUseFailure: X,
  PermissionRequest: Lock,
  PreCompact: Package,
  UserPromptSubmit: MessageSquare,
  SessionStart: Play,
  SessionEnd: Square,
  SubagentStart: GitBranch,
  SubagentStop: GitMerge,
  Notification: Bell,
  Stop: CircleStop,
};

const toolNameToIcon: Record<string, Component> = {
  Bash: Terminal,
  Read: FileText,
  Write: FilePlus2,
  Edit: FilePen,
  MultiEdit: Files,
  Glob: Search,
  Grep: SearchCode,
  WebFetch: Globe,
  WebSearch: Globe,
  Task: Users,
  TodoWrite: ListChecks,
  NotebookEdit: BookOpen,
};

const FALLBACK_ICON: Component = CircleDot;

export function getEventIcon(eventType: string): Component {
  return eventTypeToIcon[eventType] ?? FALLBACK_ICON;
}

export function getToolIcon(toolName: string): Component {
  if (toolNameToIcon[toolName]) return toolNameToIcon[toolName];
  if (toolName.startsWith('mcp__')) return Plug;
  return FALLBACK_ICON;
}

export function useEventIcons() {
  return {
    getEventIcon,
    getToolIcon,
  };
}
