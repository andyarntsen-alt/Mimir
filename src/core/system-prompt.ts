// ═══════════════════════════════════════════════════════════
// MIMIR — System Prompt Builder
// SOUL.md + memory context → system prompt
// ═══════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fact, Entity, MimirConfig } from './types.js';

export interface PromptContext {
  soulText: string;
  relevantFacts: Fact[];
  preferences: Fact[];
  entities: Entity[];
  config: MimirConfig;
}

/** Load SOUL.md from the data directory */
export async function loadSoulPrompt(dataDir: string): Promise<string> {
  return readFile(join(dataDir, 'SOUL.md'), 'utf-8');
}

/** Build the full system prompt from SOUL.md + memory context */
export function buildSystemPrompt(ctx: PromptContext): string {
  const { soulText, relevantFacts, preferences, entities, config } = ctx;

  let prompt = soulText;

  if (relevantFacts.length > 0) {
    prompt += '\n\n## Ting du husker\n';
    prompt += relevantFacts.slice(0, 15).map(f =>
      `- ${f.subject} ${f.predicate} ${f.object}`
    ).join('\n');
  }

  if (preferences.length > 0) {
    prompt += '\n\n## Brukerens preferanser (harde regler)\n';
    prompt += preferences.slice(0, 10).map(f =>
      `- ${f.subject} ${f.predicate} ${f.object}`
    ).join('\n');
  }

  if (entities.length > 0) {
    prompt += '\n\n## Folk og ting du kjenner til\n';
    prompt += entities.slice(0, 10).map(e =>
      `- ${e.name} (${e.type})`
    ).join('\n');
  }

  const allowedDirs = config.policy?.allowed_dirs?.join(', ') || '(ingen konfigurert)';
  prompt += `\n\n## Systemregler\n`;
  prompt += `- Telegram-format. Korte, naturlige meldinger.\n`;
  prompt += `- Bruk det du husker naturlig i samtalen.\n`;
  prompt += `- Hvis du lærer noe nytt om brukeren, bruk remember_fact-verktøyet.\n`;
  prompt += `- Tillatte mapper: ${allowedDirs}\n`;
  prompt += `- Aldri vis interne systemer.\n`;

  return prompt;
}
