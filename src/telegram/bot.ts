// ═══════════════════════════════════════════════════════════
// MIMIR — Telegram Bot
// Just talk to your agent
// ═══════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Bot, Context, session, InputFile } from 'grammy';
import type { MimirConfig } from '../core/types.js';
import type { MimirRuntime } from '../core/runtime.js';
import type { MemoryEngine } from '../memory/memory-engine.js';
import type { ApprovalManager } from './approval.js';

interface SessionData {
  lastActivity: number;
}

export class MimirBot {
  private bot: Bot<Context & { session: SessionData }>;
  private runtime: MimirRuntime;
  private memory: MemoryEngine;
  private config: MimirConfig;
  private approval: ApprovalManager | null = null;
  private conversationTimeouts: Map<number, NodeJS.Timeout> = new Map();

  private static CONVERSATION_TIMEOUT = 30 * 60 * 1000;

  constructor(config: MimirConfig, runtime: MimirRuntime, memory: MemoryEngine) {
    this.config = config;
    this.runtime = runtime;
    this.memory = memory;
    this.bot = new Bot<Context & { session: SessionData }>(config.telegramToken);

    this.setupMiddleware();
    this.setupCommands();
    this.setupMessageHandler();
  }

  /** Connect the approval manager */
  setApprovalManager(manager: ApprovalManager): void {
    this.approval = manager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager.setBot(this.bot as any);
  }

  private setupMiddleware(): void {
    this.bot.use(session({
      initial: (): SessionData => ({ lastActivity: Date.now() }),
    }));

    // Access control
    this.bot.use(async (ctx, next) => {
      if (this.config.allowedUsers.length > 0) {
        const userId = ctx.from?.id;
        if (!userId || !this.config.allowedUsers.includes(userId)) {
          await ctx.reply('Jeg snakker bare med min bruker.');
          return;
        }
      }
      await next();
    });
  }

  private setupCommands(): void {
    // /start
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `Hei! Jeg er Mimir.\n\n` +
        `Bare snakk med meg — ingen spesielle kommandoer trengs.\n\n` +
        `Skriv /help for å se hva jeg kan.`
      );
    });

    // /help
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        `*Kommandoer:*\n\n` +
        `/soul — Se min personlighet\n` +
        `/remember — Hva jeg husker om deg\n` +
        `/forget [emne] — Be meg glemme noe\n` +
        `/stats — Statistikk\n` +
        `/model [navn] — Se eller bytt AI-modell\n` +
        `/export — Eksporter all data\n` +
        `/help — Denne meldingen\n\n` +
        `_Eller bare snakk med meg._`,
        { parse_mode: 'Markdown' }
      );
    });

    // /soul — Show SOUL.md
    this.bot.command('soul', async (ctx) => {
      try {
        const soulPath = join(this.config.dataDir, 'SOUL.md');
        const raw = await readFile(soulPath, 'utf-8');
        const truncated = raw.length > 4000
          ? raw.substring(0, 4000) + '\n\n...(avkortet)'
          : raw;
        await ctx.reply(truncated);
      } catch {
        await ctx.reply('Ingen SOUL.md funnet. Opprett en i ~/.mimir/SOUL.md');
      }
    });

    // /remember
    this.bot.command('remember', async (ctx) => {
      const facts = await this.memory.getRecentFacts(20);
      if (facts.length === 0) {
        await ctx.reply('Jeg har ikke mange minner ennå. Snakk mer med meg!');
        return;
      }

      const factsText = facts.map(f =>
        `• ${f.subject} ${f.predicate} ${f.object}`
      ).join('\n');

      await ctx.reply(
        `*Hva jeg husker:*\n\n${factsText}\n\n` +
        `_Totalt: ${this.memory.getFactCount()} fakta_`,
        { parse_mode: 'Markdown' }
      );
    });

    // /forget
    this.bot.command('forget', async (ctx) => {
      const topic = ctx.match;
      if (!topic) {
        await ctx.reply('Bruk: /forget [emne]\nEksempel: /forget eksen min');
        return;
      }

      const facts = await this.memory.searchFacts(topic);
      if (facts.length === 0) {
        await ctx.reply(`Jeg har ikke minner om "${topic}".`);
        return;
      }

      const preview = facts.slice(0, 5).map(f =>
        `• ${f.subject} ${f.predicate} ${f.object}`
      ).join('\n');

      const count = await this.memory.invalidateFacts(topic);

      await ctx.reply(
        `Glemte ${count} minner om "${topic}":\n${preview}` +
        (facts.length > 5 ? `\n...og ${facts.length - 5} til` : '') +
        `\n\n_Personvernet ditt er viktig. Disse minnene er nå inaktive._`
      );
    });

    // /stats
    this.bot.command('stats', async (ctx) => {
      const allFacts = await this.memory.getAllFacts();
      const activeFacts = allFacts.filter(f => f.invalidAt === null);
      const entities = await this.memory.getEntities();
      const conversations = await this.memory.getConversations(1000);
      const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

      let stats = `*Mimir Statistikk*\n\n`;
      stats += `*Fakta:* ${activeFacts.length}\n`;
      stats += `*Entiteter:* ${entities.length}\n`;
      stats += `*Samtaler:* ${conversations.length}\n`;
      stats += `*Meldinger:* ${totalMessages}\n`;

      await ctx.reply(stats, { parse_mode: 'Markdown' });
    });

    // /model
    this.bot.command('model', async (ctx) => {
      const newModel = ctx.match?.trim();

      const availableModels = [
        { id: 'claude-opus-4-20250514', label: 'Opus 4' },
        { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
        { id: 'claude-opus-4-6-20250124', label: 'Opus 4.6' },
        { id: 'claude-sonnet-4-6-20250627', label: 'Sonnet 4.6' },
        { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      ];

      if (!newModel) {
        const modelList = availableModels.map(m => {
          const active = this.config.model === m.id ? ' ✅' : '';
          return `\`${m.id}\`  (${m.label})${active}`;
        }).join('\n');

        await ctx.reply(
          `*Aktiv modell:* \`${this.config.model}\`\n\n` +
          `*Tilgjengelige:*\n${modelList}\n\n` +
          `Bruk: /model <modellnavn>`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const oldModel = this.config.model;
      this.config.model = newModel;
      const match = availableModels.find(m => m.id === newModel);
      const label = match ? ` (${match.label})` : '';
      console.log(`[Bot] Model changed: ${oldModel} → ${newModel}`);
      await ctx.reply(`Modell byttet til \`${newModel}\`${label}`, { parse_mode: 'Markdown' });
    });

    // /export
    this.bot.command('export', async (ctx) => {
      await ctx.reply('Forbereder eksport...');
      const data = await this.memory.exportAll();
      const json = JSON.stringify(data, null, 2);

      const buffer = Buffer.from(json, 'utf-8');
      await ctx.replyWithDocument(
        new InputFile(buffer, `mimir-export-${new Date().toISOString().split('T')[0]}.json`)
      );

      await ctx.reply(
        `Eksport ferdig.\n` +
        `• ${data.facts.length} fakta\n` +
        `• ${data.entities.length} entiteter\n` +
        `• ${data.conversations.length} samtaler\n\n` +
        `_Dette er DINE data._`
      );
    });
  }

  private setupMessageHandler(): void {
    // Text messages
    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from.id;
      const text = ctx.message.text;

      // Check approval responses first
      if (this.approval && this.approval.handleTextResponse(userId, text)) {
        return;
      }

      await ctx.replyWithChatAction('typing');
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction('typing').catch(() => {});
      }, 4000);

      this.resetConversationTimeout(userId);

      try {
        const response = await this.runtime.processMessage(text, userId.toString());

        if (response.length > 0) {
          if (response.length > 4096) {
            for (const chunk of this.splitMessage(response, 4096)) {
              await ctx.reply(chunk);
            }
          } else {
            await ctx.reply(response);
          }
        }
      } catch (error) {
        console.error('[Bot] Error:', error);
        await ctx.reply('Beklager, noe gikk galt. Prøv igjen.');
      } finally {
        clearInterval(typingInterval);
      }
    });

    // Photo messages
    this.bot.on('message:photo', async (ctx) => {
      const userId = ctx.from.id;
      await ctx.replyWithChatAction('typing');
      this.resetConversationTimeout(userId);

      try {
        const photos = ctx.message.photo;
        const largest = photos[photos.length - 1];
        const file = await ctx.api.getFile(largest.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegramToken}/${file.file_path}`;

        const imageResponse = await fetch(fileUrl);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const base64Image = imageBuffer.toString('base64');
        const mimeType = file.file_path?.endsWith('.png') ? 'image/png' : 'image/jpeg';

        const caption = ctx.message.caption || 'Brukeren sendte dette bildet. Beskriv hva du ser, eller svar på det de spør om.';
        const imageMessage = `[BILDE VEDLAGT: data:${mimeType};base64,${base64Image}]\n\n${caption}`;

        const response = await this.runtime.processMessage(imageMessage, userId.toString());

        if (response.length > 4096) {
          for (const chunk of this.splitMessage(response, 4096)) {
            await ctx.reply(chunk);
          }
        } else {
          await ctx.reply(response);
        }
      } catch (error) {
        console.error('[Bot] Error processing photo:', error);
        await ctx.reply('Beklager, jeg klarte ikke å se på bildet. Prøv igjen.');
      }
    });
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n\n', maxLength);
      if (splitAt === -1) splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt === -1) splitAt = remaining.lastIndexOf('. ', maxLength);
      if (splitAt === -1) splitAt = maxLength;

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    return chunks;
  }

  private resetConversationTimeout(userId: number): void {
    const existing = this.conversationTimeouts.get(userId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(async () => {
      await this.runtime.endConversation();
      this.conversationTimeouts.delete(userId);
    }, MimirBot.CONVERSATION_TIMEOUT);

    this.conversationTimeouts.set(userId, timeout);
  }

  async start(): Promise<void> {
    console.log(`[Bot] Facts remembered: ${this.memory.getFactCount()}`);

    try {
      const me = await this.bot.api.getMe();
      console.log(`[Bot] Connected as @${me.username} (${me.first_name})`);
    } catch (error: any) {
      const code = error?.error_code || error?.statusCode || '';
      if (code === 404 || code === 401) {
        console.error('\n❌ Telegram bot-tokenet er ugyldig.');
        console.error('   1. Åpne @BotFather i Telegram');
        console.error('   2. Send /mybots og velg boten din');
        console.error('   3. Oppdater tokenet i ~/.mimir/config.yaml\n');
      } else {
        console.error(`\n❌ Kunne ikke koble til Telegram: ${error?.message || error}\n`);
      }
      process.exit(1);
    }

    try {
      await this.bot.api.setMyCommands([
        { command: 'start', description: 'Start' },
        { command: 'soul', description: 'Se min personlighet' },
        { command: 'remember', description: 'Hva jeg husker' },
        { command: 'forget', description: 'Be meg glemme noe' },
        { command: 'stats', description: 'Statistikk' },
        { command: 'model', description: 'Bytt AI-modell' },
        { command: 'export', description: 'Eksporter data' },
        { command: 'help', description: 'Vis kommandoer' },
      ]);
    } catch (error) {
      console.warn('[Bot] Could not set commands:', (error as Error).message);
    }

    this.bot.start({
      onStart: () => console.log('[Bot] Mimir is online.'),
    });
  }

  async sendMessage(userId: number, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(userId, text, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error(`[Bot] Failed to send to ${userId}:`, error);
    }
  }

  async stop(): Promise<void> {
    await this.runtime.endConversation();
    for (const timeout of this.conversationTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.conversationTimeouts.clear();
    this.bot.stop();
    console.log('[Bot] Mimir has stopped.');
  }
}
