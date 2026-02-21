// ═══════════════════════════════════════════════════════════
// MIMIR — Entry Point
// ═══════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import cron from 'node-cron';
import type { MimirConfig, PolicyConfig } from './core/types.js';
import { MimirRuntime } from './core/runtime.js';
import { MemoryEngine } from './memory/memory-engine.js';
import { MimirBot } from './telegram/bot.js';
import { generateCheapResponse } from './core/llm.js';
import { PolicyEngine } from './core/policy-engine.js';
import { ApprovalManager } from './telegram/approval.js';
import { initializeTools } from './tools/index.js';

/** Default policy config — conservative defaults */
const DEFAULT_POLICY: PolicyConfig = {
  allowed_dirs: [],
  blocked_commands: [],
  shell_enabled: false,
  browser_enabled: true,
  require_approval_for_writes: true,
};

/**
 * Start Mimir.
 *
 * 1. Load config
 * 2. Initialize memory
 * 3. Initialize policy engine + approval
 * 4. Initialize tools
 * 5. Initialize runtime
 * 6. Start Telegram bot
 * 7. Start reminder cron
 */
export async function startMimir(dataDir: string): Promise<void> {
  console.log('🐦 Mimir is waking up...\n');

  // ─── 1. Load config ─────────────────────────────────────
  const configPath = join(dataDir, 'config.yaml');
  if (!existsSync(configPath)) {
    console.error('❌ No config found. Run: mimir init');
    process.exit(1);
  }

  const configContent = await readFile(configPath, 'utf-8');
  const config: MimirConfig = YAML.parse(configContent);

  // Resolve env: references
  if (config.apiKey.startsWith('env:')) {
    const envVar = config.apiKey.replace('env:', '');
    const value = process.env[envVar];
    if (!value) {
      console.error(`❌ Environment variable ${envVar} not set.`);
      process.exit(1);
    }
    config.apiKey = value;
  }

  if (config.telegramToken.startsWith('env:')) {
    const envVar = config.telegramToken.replace('env:', '');
    const value = process.env[envVar];
    if (!value) {
      console.error(`❌ Environment variable ${envVar} not set.`);
      process.exit(1);
    }
    config.telegramToken = value;
  }

  config.dataDir = dataDir;

  // ─── 2. Initialize Memory ──────────────────────────────
  console.log('🧠 Initializing memory...');
  const memory = new MemoryEngine(dataDir);
  await memory.initialize();

  // ─── 3. Initialize Policy Engine + Approval ─────────────
  const policyConfig: PolicyConfig = config.policy || DEFAULT_POLICY;
  let policyEngine: PolicyEngine | undefined;
  let approvalManager: ApprovalManager | undefined;

  if (policyConfig.allowed_dirs.length > 0 || policyConfig.shell_enabled || policyConfig.browser_enabled) {
    console.log('🛡️  Initializing policy engine...');
    policyEngine = new PolicyEngine(policyConfig, dataDir);
    await policyEngine.initialize();

    approvalManager = new ApprovalManager(config.allowedUsers);

    console.log(`[Policy] Allowed dirs: ${policyConfig.allowed_dirs.join(', ') || '(none)'}`);
    console.log(`[Policy] Shell: ${policyConfig.shell_enabled ? 'ON' : 'OFF'}`);
    console.log(`[Policy] Browser: ${policyConfig.browser_enabled ? 'ON' : 'OFF'}`);
  }

  // ─── 4. Initialize Tools ───────────────────────────────
  console.log('🔧 Loading tools...');
  const { tools, reminderStore } = await initializeTools(
    dataDir, config, memory, policyEngine, approvalManager
  );

  // ─── 5. Initialize Runtime ─────────────────────────────
  console.log('⚡ Starting runtime...');
  const runtime = new MimirRuntime({
    config,
    memoryEngine: memory,
    tools,
  });

  // ─── 6. Start Telegram Bot ─────────────────────────────
  console.log('💬 Connecting to Telegram...');
  const bot = new MimirBot(config, runtime, memory);

  if (approvalManager) {
    bot.setApprovalManager(approvalManager);
  }

  await bot.start();

  // ─── 7. Reminder Cron ──────────────────────────────────
  let reminderRunning = false;

  cron.schedule('* * * * *', async () => {
    if (reminderRunning) return;
    reminderRunning = true;
    try {
      const due = await reminderStore.getDue();
      for (const reminder of due) {
        console.log(`[Reminder] Due: ${reminder.text}`);
        for (const userId of config.allowedUsers) {
          try {
            const lang = config.language === 'no' ? 'Skriv på norsk.' : 'Write in English.';
            const response = await generateCheapResponse({
              prompt: `Du er Mimir. En påminnelse er nå utløst: "${reminder.text}". Skriv en kort, naturlig melding (1-2 setninger). ${lang}`,
            });
            await bot.sendMessage(userId, response || `⏰ ${reminder.text}`);
          } catch (err) {
            await bot.sendMessage(userId, `⏰ ${reminder.text}`).catch(() => {});
            console.error(`[Reminder] Failed to deliver to ${userId}:`, err);
          }
        }
        await reminderStore.markNotified(reminder.id);
      }
    } catch (error) {
      console.error('[Cron] Reminder check failed:', error);
    } finally {
      reminderRunning = false;
    }
  });

  console.log('\n🐦 Mimir is airborne. Waiting for messages...\n');

  // ─── Graceful shutdown ─────────────────────────────────
  const shutdown = async () => {
    console.log('\n🐦 Mimir is landing...');
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Direct execution only when run as main module
const isDirectRun = process.argv[1]?.endsWith('/index.js') && !process.argv[1]?.includes('/cli/');
if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.length > 0 && !args[0].startsWith('-')) {
    const dataDir = args[0].replace('~', process.env.HOME || '');
    startMimir(dataDir);
  }
}
