// ═══════════════════════════════════════════════════════════
// MIMIR — CLI Chat Mode
// Test Mimir without Telegram — pure terminal conversation
// ═══════════════════════════════════════════════════════════

import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import type { MimirConfig } from '../core/types.js';
import { MimirRuntime } from '../core/runtime.js';
import { MemoryEngine } from '../memory/memory-engine.js';
import { initializeTools } from '../tools/index.js';

export async function startChat(dataDir: string): Promise<void> {
  console.log(chalk.cyan(`
    ╭──────────────────────────────╮
    │       🐦 M I M I R          │
    │       CLI Chat Mode          │
    ╰──────────────────────────────╯
  `));

  // Load config
  const configPath = join(dataDir, 'config.yaml');
  if (!existsSync(configPath)) {
    console.error(chalk.red('❌ No config found. Run: mimir init'));
    process.exit(1);
  }

  const configContent = await readFile(configPath, 'utf-8');
  const config: MimirConfig = YAML.parse(configContent);

  if (config.apiKey.startsWith('env:')) {
    const envVar = config.apiKey.replace('env:', '');
    const value = process.env[envVar];
    if (!value) {
      console.error(chalk.red(`❌ Environment variable ${envVar} not set.`));
      process.exit(1);
    }
    config.apiKey = value;
  }

  config.dataDir = dataDir;

  // Initialize
  console.log(chalk.dim('  Initializing...'));
  const memory = new MemoryEngine(dataDir);
  await memory.initialize();

  const { tools } = await initializeTools(dataDir);

  const runtime = new MimirRuntime({
    config,
    memoryEngine: memory,
    tools,
  });

  console.log(chalk.green(`\n  🐦 Mimir is ready.`));
  console.log(chalk.dim(`  Facts: ${memory.getFactCount()}`));
  console.log(chalk.dim('  Commands: /memory /soul /facts /quit /help\n'));

  // REPL
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('you → '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input.startsWith('/')) {
      await handleCommand(input, runtime, memory, dataDir);
      rl.prompt();
      return;
    }

    try {
      process.stdout.write(chalk.yellow('🐦 thinking...'));
      const response = await runtime.processMessage(input, 'cli-user');
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.yellow('🐦 Mimir → ') + response);
      console.log();
    } catch (error) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
      console.log();
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log(chalk.dim('\n  🐦 Bye.\n'));
    await runtime.endConversation();
    process.exit(0);
  });
}

async function handleCommand(
  input: string,
  runtime: MimirRuntime,
  memory: MemoryEngine,
  dataDir: string,
): Promise<void> {
  const [command] = input.split(' ');

  switch (command) {
    case '/memory':
    case '/remember': {
      const facts = await memory.getRecentFacts(20);
      if (facts.length === 0) {
        console.log(chalk.dim('\n  No memories yet.\n'));
      } else {
        console.log(chalk.yellow('\n  🧠 What I remember:\n'));
        for (const f of facts) {
          console.log(chalk.dim(`  • ${f.subject} ${f.predicate} ${f.object}`));
        }
        console.log(chalk.dim(`\n  Total: ${memory.getFactCount()}\n`));
      }
      break;
    }

    case '/soul': {
      try {
        const raw = await readFile(join(dataDir, 'SOUL.md'), 'utf-8');
        console.log('\n' + chalk.dim(raw) + '\n');
      } catch {
        console.log(chalk.dim('\n  No SOUL.md found.\n'));
      }
      break;
    }

    case '/facts': {
      const allFacts = await memory.getAllFacts();
      console.log(chalk.yellow(`\n  All facts (${allFacts.length}):\n`));
      for (const f of allFacts) {
        const status = f.invalidAt ? chalk.red('✗') : chalk.green('✓');
        console.log(`  ${status} ${f.subject} ${f.predicate} ${f.object} ${chalk.dim(`[${f.source}]`)}`);
      }
      console.log();
      break;
    }

    case '/quit':
    case '/exit': {
      console.log(chalk.dim('\n  🐦 Bye.\n'));
      await runtime.endConversation();
      process.exit(0);
    }

    case '/help': {
      console.log(chalk.dim('\n  Commands:'));
      console.log(chalk.dim('    /memory  — what I remember'));
      console.log(chalk.dim('    /soul    — current SOUL.md'));
      console.log(chalk.dim('    /facts   — raw fact dump'));
      console.log(chalk.dim('    /quit    — exit\n'));
      break;
    }

    default: {
      console.log(chalk.dim(`\n  Unknown: ${command}. Type /help\n`));
    }
  }
}
