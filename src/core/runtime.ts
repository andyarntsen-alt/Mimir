// ═══════════════════════════════════════════════════════════
// MIMIR — Core Runtime
// Message in → context + memory → Claude → response out
// ═══════════════════════════════════════════════════════════

import type { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { MimirConfig, Message, Conversation, Tool } from './types.js';
import type { MemoryEngine } from '../memory/memory-engine.js';
import { RateLimiter } from './errors.js';
import { loadSoulPrompt, buildSystemPrompt } from './system-prompt.js';
import { buildMcpServer, getAllowedTools, createToolPermissionCallback } from './mcp-server.js';
import { runAgentQuery } from './agent-query.js';

export interface RuntimeOptions {
  config: MimirConfig;
  memoryEngine: MemoryEngine;
  tools?: Tool[];
}

export class MimirRuntime {
  private config: MimirConfig;
  private memory: MemoryEngine;
  private rateLimiter: RateLimiter;
  private tools: Tool[];
  private currentConversation: Conversation | null = null;
  private mcpServer: ReturnType<typeof createSdkMcpServer> | null = null;
  private lastSessionId: string | null = null;

  constructor(options: RuntimeOptions) {
    this.config = options.config;
    this.memory = options.memoryEngine;
    this.tools = options.tools || [];
    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: 20,
      maxDailyCostUSD: 5.0,
    });

    this.mcpServer = buildMcpServer(this.memory, this.tools);
  }

  /** Process a user message and generate a response */
  async processMessage(
    userMessage: string,
    userId?: string,
    onProgress?: (text: string) => void,
  ): Promise<string> {
    // Load or create conversation — resume if <30 min old
    if (!this.currentConversation) {
      const recent = await this.memory.getConversations(1);
      const last = recent[0];
      if (last && !last.endedAt) {
        const lastMsg = last.messages[last.messages.length - 1];
        const timeSince = lastMsg
          ? Date.now() - new Date(lastMsg.timestamp).getTime()
          : Infinity;
        if (timeSince < 30 * 60 * 1000) {
          this.currentConversation = last;
          console.log(`[Runtime] Resumed conversation ${last.id}`);
        }
      }
      if (!this.currentConversation) {
        this.currentConversation = await this.memory.startConversation();
      }
    }

    // Add user message to conversation
    const userMsg: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      metadata: userId ? { userId } : undefined,
    };
    this.currentConversation.messages.push(userMsg);

    // Check rate limit
    const rateCheck = this.rateLimiter.canRequest();
    if (!rateCheck.allowed) {
      return `Jeg må ta det litt roligere. ${rateCheck.reason}`;
    }

    // Build system prompt from SOUL.md + memory
    const soulText = await loadSoulPrompt(this.config.dataDir);
    const systemPrompt = buildSystemPrompt({
      soulText,
      relevantFacts: await this.memory.searchRelevantFacts(userMessage, 15),
      preferences: await this.memory.getPreferences(10),
      entities: await this.memory.getEntities(10),
      config: this.config,
    });

    // Conversation history
    const recentMessages = this.currentConversation.messages
      .slice(-this.config.maxContextMessages)
      .slice(0, -1);

    const historyContext = recentMessages.length > 0
      ? recentMessages.map(m => `${m.role === 'user' ? 'Bruker' : 'Du'}: ${m.content}`).join('\n\n') + '\n\n'
      : '';

    // Summaries from previous conversations
    const previousSummaries = await this.memory.getConversationSummaries(5);
    const summaryContext = previousSummaries.length > 0
      ? `Oppsummeringer fra tidligere samtaler:\n${previousSummaries.map(s => `- ${s}`).join('\n')}\n\n`
      : '';

    const fullPrompt = summaryContext + historyContext + `Bruker: ${userMessage}`;
    const allowedTools = getAllowedTools(this.tools);

    try {
      const result = await runAgentQuery({
        prompt: fullPrompt,
        systemPrompt,
        model: this.config.model || 'sonnet',
        maxTurns: 25,
        mcpServer: this.mcpServer,
        allowedTools,
        canUseTool: createToolPermissionCallback(allowedTools),
        cwd: process.env.HOME || '/tmp',
        continueSession: !!this.lastSessionId,
      });

      if (result.sessionId) {
        this.lastSessionId = result.sessionId;
      }

      return await this.finalizeResponse(result.text, result.costUsd);
    } catch (error) {
      console.error('[Runtime] Error:', error instanceof Error ? error.message : error);

      // One retry
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await runAgentQuery({
          prompt: fullPrompt,
          systemPrompt,
          model: this.config.model || 'sonnet',
          maxTurns: 10,
          mcpServer: this.mcpServer,
          allowedTools,
          canUseTool: createToolPermissionCallback(allowedTools),
          cwd: process.env.HOME || '/tmp',
        });

        return await this.finalizeResponse(
          result.text || 'Beklager, noe gikk galt. Prøv igjen.',
          result.costUsd,
        );
      } catch (retryError) {
        console.error('[Runtime] Retry failed:', retryError instanceof Error ? retryError.message : retryError);
        return 'Beklager, jeg mistet tråden et øyeblikk. Kan du prøve igjen?';
      }
    }
  }

  /** Save response to conversation */
  private async finalizeResponse(responseText: string, costUsd?: number): Promise<string> {
    this.rateLimiter.recordRequest(costUsd || 0.01);

    const text = responseText.trim()
      ? responseText
      : 'Beklager, jeg fikk ikke formulert et svar. Kan du prøve igjen?';

    const assistantMsg: Message = {
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.currentConversation!.messages.push(assistantMsg);
    await this.memory.saveConversation(this.currentConversation!);

    return text;
  }

  /** End the current conversation and summarize */
  async endConversation(): Promise<void> {
    if (!this.currentConversation) return;

    this.currentConversation.endedAt = new Date().toISOString();

    try {
      const messages = this.currentConversation.messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const result = await runAgentQuery({
        prompt: `Summarize this conversation in 2-3 sentences, focusing on key facts learned and topics discussed:\n\n${messages}`,
        systemPrompt: '',
        model: 'haiku',
        maxTurns: 1,
        mcpServer: null,
        allowedTools: [],
        canUseTool: createToolPermissionCallback([]),
        cwd: process.env.HOME || '/tmp',
      });

      this.currentConversation.summary = result.text;
    } catch {
      // Summarization is nice-to-have
    }

    await this.memory.saveConversation(this.currentConversation);
    this.currentConversation = null;
    this.lastSessionId = null;
  }

  /** Get conversation history */
  async getConversationHistory(limit: number = 10): Promise<Conversation[]> {
    return this.memory.getConversations(limit);
  }
}
