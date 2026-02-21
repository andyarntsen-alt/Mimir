// ═══════════════════════════════════════════════════════════
// MIMIR — Core Types
// ═══════════════════════════════════════════════════════════

/** A temporal fact — something the agent knows, with time dimension */
export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  validAt: string;        // ISO date when this became true
  invalidAt: string | null; // ISO date when this stopped being true (null = still true)
  confidence: number;      // 0-1
  source: 'conversation' | 'observation' | 'inference' | 'user-stated';
  context?: string;        // Optional context about when/how this was learned
}

/** An entity in the knowledge graph */
export interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'place' | 'concept' | 'preference' | 'event' | 'other';
  attributes: Record<string, string>;
  firstSeen: string;
  lastSeen: string;
}

/** A conversation message */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** A conversation session */
export interface Conversation {
  id: string;
  startedAt: string;
  endedAt?: string;
  messages: Message[];
  summary?: string;
}

/** Configuration for the agent */
export interface MimirConfig {
  /** LLM provider */
  provider: string;
  /** Model name */
  model: string;
  /** API key (or env var reference) */
  apiKey: string;
  /** Custom base URL for API */
  baseUrl?: string;
  /** Telegram bot token */
  telegramToken: string;
  /** Allowed Telegram user IDs (empty = allow all) */
  allowedUsers: number[];
  /** Language preference */
  language: string;
  /** Max conversation history to keep in context */
  maxContextMessages: number;
  /** Data directory */
  dataDir: string;
  /** Policy configuration for agent capabilities */
  policy?: PolicyConfig;
}

/** A tool the agent can use */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ─── Policy & Agent Capabilities ────────────────────────

/** Risk levels for tool operations */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'blocked';

/** A policy decision */
export interface PolicyDecision {
  allowed: boolean;
  risk: RiskLevel;
  reason: string;
  requiresApproval: boolean;
}

/** Audit log entry */
export interface AuditEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  decision: 'allowed' | 'denied' | 'approved' | 'rejected' | 'timeout';
  userId?: string;
  executionTimeMs?: number;
  result?: string;
  error?: string;
}

/** Policy configuration */
export interface PolicyConfig {
  /** Directories Mimir is allowed to access */
  allowed_dirs: string[];
  /** Shell commands that are always blocked */
  blocked_commands: string[];
  /** Enable shell access */
  shell_enabled: boolean;
  /** Enable browser/web access */
  browser_enabled: boolean;
  /** Always require approval for file writes */
  require_approval_for_writes: boolean;
  /** Risk overrides per tool:args pattern */
  risk_overrides?: Record<string, RiskLevel>;
}

/** Approval request for Telegram */
export interface ApprovalRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  description: string;
  resolve: (approved: boolean) => void;
  createdAt: number;
}
