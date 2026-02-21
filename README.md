# Muninn

Your personal AI that remembers everything. Open source, private, evolving.

Named after Odin's raven of memory from Norse mythology. Muninn is an AI agent that lives in your Telegram, remembers your conversations, learns your preferences, and evolves its personality over time.

## What makes Muninn different

Most AI assistants forget you the moment the conversation ends. Muninn doesn't.

**Temporal memory.** Facts are stored with time dimensions. Muninn knows what *was* true and what *is* true. When things change, old facts are invalidated, not deleted.

**Evolving identity.** Muninn's personality is defined in a `SOUL.md` file that it modifies itself during reflection cycles. It starts curious and grows into a proactive partner.

**Relationship progression.** Four phases: Curious, Learning, Understanding, Proactive. Earned through genuine interaction, not time alone.

**100% private.** Self-hosted, file-based storage, no cloud dependencies. Your data never leaves your machine.

## Quick start

You need Node.js 20+, a Telegram bot token from [@BotFather](https://t.me/BotFather), and a Claude API key from [Anthropic](https://console.anthropic.com).

```bash
git clone https://github.com/andyarntsen-alt/Muninn.git
cd Muninn
npm install
npm run setup
npm run build
node dist/cli/index.js start
```

`npm run setup` walks you through configuration: API keys, Telegram token, language, and allowed directories.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Telegram                    │
│              (User Interface)                │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Huginn Runtime                  │
│         (Reasoning · the mind)               │
│  Processes messages, calls tools,            │
│  generates responses                         │
└──────┬─────────┬──────────┬─────────────────┘
       │         │          │
┌──────▼───┐ ┌───▼────┐ ┌──▼──────────────┐
│  Memory  │ │  Soul  │ │    Tools        │
│ (Muninn) │ │Manager │ │ Read/write files│
│          │ │        │ │ Run commands    │
│ Facts    │ │ SOUL.md│ │ Web browsing    │
│ Entities │ │ Evolve │ │ (extensible)    │
│ Convos   │ │ Phases │ │                 │
└──────────┘ └────────┘ └─────────────────┘
       │         │
┌──────▼─────────▼────────────────────────────┐
│            Reflection System                 │
│  Periodic self-examination                   │
│  Pattern discovery, soul evolution           │
│  Relationship phase transitions              │
└─────────────────────────────────────────────┘
```

**Huginn** (Old Norse: "thought") is the reasoning engine. **Muninn** (Old Norse: "memory") is the memory engine.

## Data storage

Everything is stored in `~/.muninn/` as human-readable files:

```
~/.muninn/
├── config.yaml          # Configuration
├── SOUL.md              # Agent identity (self-modifying)
├── evolution.json       # Evolution history
├── interaction-count    # Total interactions
├── facts/
│   └── facts.jsonl      # Temporal knowledge graph
├── entities/
│   └── entities.json    # Known people, places, concepts
└── conversations/
    └── {id}.json        # Conversation logs
```

You can inspect, edit, or version-control your agent's entire memory with git.

## Telegram commands

| Command | Description |
|---------|-------------|
| `/soul` | View current SOUL.md |
| `/facts` | What Muninn remembers about you |
| `/goals` | Manage goals |
| `/reflect` | Trigger a reflection cycle |
| `/stats` | Analytics and statistics |
| `/model` | Switch Claude model |
| `/quiet` | Toggle quiet mode |

Or just talk. That's the whole point.

## Relationship phases

| Phase | Behavior |
|-------|----------|
| **Curious** | Asks questions, learns basics, warm but not presumptuous |
| **Learning** | Makes connections, references what it knows, offers suggestions |
| **Understanding** | Anticipates needs, proactive suggestions, genuine thinking partner |
| **Proactive** | Takes initiative, acts autonomously within boundaries, true partnership |

## Configuration

After `npm run setup`, your config lives in `~/.muninn/config.yaml`:

```yaml
model: claude-sonnet-4-20250514
apiKey: env:ANTHROPIC_API_KEY
telegramToken: "your-token-here"
allowedUsers:
  - 123456789
language: no
reflectionInterval: 24
maxContextMessages: 20
dataDir: ~/.muninn
```

## Reflection system

Periodically, Muninn pauses to reflect. It reviews recent conversations, identifies patterns, considers whether its personality should evolve, and checks for relationship phase transitions. Each reflection creates a versioned backup of SOUL.md, so you can trace how your agent evolved over time.

## Contributing

Muninn is open source under MIT. Contributions welcome.

## License

MIT

---

*Built with curiosity by Andy & Claude.*
