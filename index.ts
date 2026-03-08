/**
 * Memory Blocks Extension
 *
 * Gives the LLM persistent, self-editable memory blocks (inspired by MemGPT/Letta).
 * Blocks are stored as .pi/memory/<key>.md files with frontmatter metadata.
 *
 * - Blocks are injected into the system prompt every turn
 * - The LLM can update blocks via the `updateMemory` tool
 * - Only existing block keys can be written to (no creation by LLM)
 * - Two default blocks are provided: `user` and `agent`
 */

import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Text } from "@mariozechner/pi-tui";

// --- Types ---

const BlockFrontmatter = Type.Object({
  description: Type.String({ default: "" }),
  limit: Type.Number({ default: 2000 }),
});

type BlockFrontmatter = Static<typeof BlockFrontmatter>;

type Block = BlockFrontmatter & {
  content: string;
};

type BlockEntry = {
  key: string;
  block: Block;
};

// --- Block I/O ---

const parseBlock = (raw: string): Block => {
  const { data, content } = matter(raw);
  const frontmatter = Value.Decode(
    BlockFrontmatter,
    Value.Default(BlockFrontmatter, data),
  );
  return { ...frontmatter, content: content.trim() };
};

const serializeBlock = (block: Block): string => {
  const frontmatter = yaml
    .dump(
      { description: block.description, limit: block.limit },
      { lineWidth: -1 },
    )
    .trim();
  return `---\n${frontmatter}\n---\n${block.content}\n`;
};

const getMemoryDir = (cwd: string): string => path.join(cwd, ".pi", "memory-blocks");

const listBlockKeys = (memoryDir: string): string[] => {
  if (!fs.existsSync(memoryDir)) return [];
  return fs
    .readdirSync(memoryDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
};

const readBlock = (memoryDir: string, key: string): Block => {
  const filePath = path.join(memoryDir, `${key}.md`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseBlock(raw);
};

const writeBlock = (memoryDir: string, key: string, block: Block): void => {
  const filePath = path.join(memoryDir, `${key}.md`);
  fs.writeFileSync(filePath, serializeBlock(block), "utf-8");
};

const readAllBlocks = (memoryDir: string): BlockEntry[] =>
  listBlockKeys(memoryDir).map((key) => ({
    key,
    block: readBlock(memoryDir, key),
  }));

const DEFAULT_MEMORY_BLOCKS: Record<string, Block> = {
  user: {
    description: "Information about the user",
    limit: 2000,
    content: "",
  },
  agent: {
    description: "Information about the agent's role and context",
    limit: 2000,
    content: "",
  },
};

const ensureDefaults = (memoryDir: string): void => {
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  for (const [key, block] of Object.entries(DEFAULT_MEMORY_BLOCKS)) {
    const filePath = path.join(memoryDir, `${key}.md`);
    if (!fs.existsSync(filePath)) {
      writeBlock(memoryDir, key, block);
    }
  }
};

// --- Format helpers ---

const renderMemoryBlock = ({ key, block }: BlockEntry): string => {
  return `<${key}>
  <description>${block.description}</description>
  <content char-limit=${block.limit} char-count=${block.content.length}>
    ${block.content}
  </content>
</${key}>`;
};

const renderMemorySystemPrompt = (blocks: BlockEntry[]): string => {
  const blockMarkup = blocks.map((b) => renderMemoryBlock(b)).join("\n");
  return `You have persistent memory blocks that survive across sessions. Use the updateMemory tool to store important information you learn. Review your memory blocks below and keep them up to date.

<memory_blocks>
  ${blockMarkup}
</memory_blocks>
`;
};

// --- Extension ---

export default function memoryExtension(pi: ExtensionAPI) {
  let memoryDir = "";

  // Ensure default blocks exist on session start
  pi.on("session_start", async (_event, ctx) => {
    memoryDir = getMemoryDir(ctx.cwd);
    ensureDefaults(memoryDir);

    const blocks = readAllBlocks(memoryDir);
    const count = blocks.length;
    const nonEmpty = blocks.filter((b) => b.block.content.length > 0).length;
    ctx.ui.notify(`Memory: ${count} block(s), ${nonEmpty} non-empty`, "info");
  });

  // Inject memory blocks into system prompt every turn
  pi.on("before_agent_start", async (event) => {
    if (!memoryDir) return;

    const blocks = readAllBlocks(memoryDir);
    if (blocks.length === 0) return;

    const blocksText = blocks.map(renderMemoryBlock).join("\n\n");

    return {
      systemPrompt: [event.systemPrompt, renderMemorySystemPrompt(blocks)].join(
        "\n\n",
      ),
    };
  });

  // Register the updateMemory tool
  pi.registerTool({
    name: "updateMemory",
    label: "Update Memory",
    description:
      "Update a persistent memory block. If oldText is provided, it is replaced with newText. " +
      "If oldText is omitted, newText is appended. Content is truncated to the block's character limit.",
    promptSnippet: "Update a persistent memory block (replace or append text)",
    promptGuidelines: [
      "Use updateMemory to persist important facts you learn about the user, project, or your own role.",
      "Prefer replacing outdated information over appending duplicates.",
      "Keep memory blocks concise and well-organized.",
    ],
    parameters: Type.Object({
      blockKey: Type.String({
        description:
          "Block key (e.g. 'user', 'agent'). Must be an existing block.",
      }),
      oldText: Type.Optional(
        Type.String({
          description: "Text to find and replace. Omit to append instead.",
        }),
      ),
      newText: Type.String({
        description:
          "Replacement text, or text to append if oldText is omitted.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { blockKey, oldText, newText } = params;

      // Validate block exists
      const keys = listBlockKeys(memoryDir);
      if (!keys.includes(blockKey)) {
        throw new Error(
          `Block "${blockKey}" does not exist. Available blocks: ${keys.join(", ")}`,
        );
      }

      const block = readBlock(memoryDir, blockKey);
      let truncated = false;

      if (oldText !== undefined) {
        // Replace mode
        if (!block.content.includes(oldText)) {
          throw new Error(
            `oldText not found in block "${blockKey}". Use the memory shown in the system prompt as reference.`,
          );
        }
        block.content = block.content.replace(oldText, newText);
      } else {
        // Append mode
        block.content = block.content
          ? block.content + "\n" + newText
          : newText;
      }

      // Truncate to limit
      if (block.content.length > block.limit) {
        block.content = block.content.slice(0, block.limit);
        truncated = true;
      }

      writeBlock(memoryDir, blockKey, block);

      const usage = `${block.content.length}/${block.limit}`;
      const truncMsg = truncated ? " (truncated to limit)" : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated block "${blockKey}" [${usage}]${truncMsg}\n\nCurrent content:\n${block.content}`,
          },
        ],
        details: { blockKey, usage, truncated, content: block.content },
      };
    },

    renderCall(args, theme) {
      const op = args.oldText !== undefined ? "replace" : "append";
      let text = theme.fg("toolTitle", theme.bold("updateMemory "));
      text += theme.fg("accent", args.blockKey);
      text += " " + theme.fg("muted", `(${op})`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as
        | {
            blockKey: string;
            usage: string;
            truncated: boolean;
            content: string;
          }
        | undefined;

      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      let text =
        theme.fg("success", "✓ ") +
        theme.fg("accent", details.blockKey) +
        " " +
        theme.fg("muted", `[${details.usage}]`);

      if (details.truncated) {
        text += " " + theme.fg("warning", "(truncated)");
      }

      if (expanded && details.content) {
        text += "\n" + theme.fg("dim", details.content);
      }

      return new Text(text, 0, 0);
    },
  });

  // Register /memory command to view blocks
  pi.registerCommand("memory", {
    description: "Show all memory blocks and their usage",
    handler: async (_args, ctx) => {
      const blocks = readAllBlocks(memoryDir);

      if (blocks.length === 0) {
        ctx.ui.notify("No memory blocks found.", "info");
        return;
      }

      const lines = blocks.map(({ key, block }) => {
        const usage = `${block.content.length}/${block.limit}`;
        const bar = "█"
          .repeat(Math.round((block.content.length / block.limit) * 20))
          .padEnd(20, "░");
        const preview = block.content
          ? block.content.slice(0, 80).replace(/\n/g, " ") +
            (block.content.length > 80 ? "…" : "")
          : "(empty)";
        return `${key} [${usage}] ${bar}\n  ${block.description}\n  ${preview}`;
      });

      ctx.ui.notify(lines.join("\n\n"), "info");
    },
  });
}
