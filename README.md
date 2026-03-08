# pi-memory-blocks

Letta/MemGPT-style persistent memory blocks for
[Pi](https://github.com/badlogic/pi-mono) coding agents. Gives the LLM
self-editable memory that survives across sessions.

## What it does

- Creates persistent memory blocks stored as Markdown files with frontmatter
  (`.pi/memory-blocks/<key>.md`)
- Injects all memory blocks into the system prompt every turn
- Provides an `updateMemory` tool the LLM can use to update its own memory
- Ships with two default blocks: `user` (facts about you) and `agent` (facts
  about its role and context)
- Each block has a configurable character limit (default: 2000 chars)

The LLM sees its memory blocks in the system prompt and can decide to persist
important information — user preferences, project context, its own role — using
the `updateMemory` tool. Memory accumulates over sessions, giving the agent
long-term recall.

## Installation

Add this package to your project's Pi settings (`.pi/settings.json`):

```json
{
  "packages": ["../path/to/pi-memory-blocks"]
}
```

Or reference it from your global Pi settings (`~/.pi/agent/settings.json`).

Then run `npm install` in this directory if you haven't already:

```bash
npm install
```

## How it works

### Memory blocks

Each block is a `.md` file in `.pi/memory-blocks/` with YAML frontmatter:

```markdown
---
description: Information about the user
limit: 2000
---
Prefers functional programming style. Uses TypeScript and Deno.
Name is Gordon.
```

- `description` — tells the LLM what the block is for
- `limit` — maximum character count for the block's content

On first run, the extension creates two default blocks (`user.md` and
`agent.md`) if they don't exist. You can add more blocks manually — just create
a new `.md` file with the frontmatter format above.

### The `updateMemory` tool

The LLM can call `updateMemory` with:

| Parameter  | Required | Description                                          |
| ---------- | -------- | ---------------------------------------------------- |
| `blockKey` | Yes      | Block to update (e.g. `"user"`, `"agent"`)           |
| `oldText`  | No       | Text to find and replace. Omit to append instead.    |
| `newText`  | Yes      | Replacement text, or text to append if no `oldText`. |

The tool supports two modes:

- **Replace** — finds `oldText` in the block and replaces it with `newText`
- **Append** — if `oldText` is omitted, appends `newText` to the block

Content is truncated to the block's character limit if it exceeds it. The LLM
can only write to existing blocks — it cannot create new ones.

### The `/memory` command

Type `/memory` in the Pi TUI to see all memory blocks, their usage bars, and
content previews.

## Adding custom blocks

Create a new `.md` file in `.pi/memory-blocks/`:

```markdown
---
description: Current project architecture decisions
limit: 4000
---
```

The block key is the filename without `.md`. The LLM will see it in its system
prompt and can update it with `updateMemory`.

## Inspiration

Inspired by [Letta](https://github.com/letta-ai/letta) (formerly MemGPT),
which pioneered the idea of giving LLMs self-editable memory blocks with
bounded capacity.

## License

MIT
