import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseBlock,
  serializeBlock,
  getMemoryDir,
  listBlockKeys,
  readBlock,
  writeBlock,
  readAllBlocks,
  ensureDefaults,
  renderMemoryBlock,
  renderMemorySystemPrompt,
  DEFAULT_MEMORY_BLOCKS,
  type Block,
  type BlockEntry,
} from "./index.ts";

// --- Helpers ---

const makeTmpDir = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pi-memory-test-"));

const cleanUp = (dir: string): void => {
  fs.rmSync(dir, { recursive: true, force: true });
};

const sampleBlock: Block = {
  description: "Test block",
  limit: 100,
  content: "hello world",
};

// --- parseBlock ---

describe("parseBlock", () => {
  it("parses frontmatter and content", () => {
    const raw = `---
description: My block
limit: 500
---
Some content here`;
    const block = parseBlock(raw);
    assert.equal(block.description, "My block");
    assert.equal(block.limit, 500);
    assert.equal(block.content, "Some content here");
  });

  it("trims content whitespace", () => {
    const raw = `---
description: trimmed
limit: 100
---

  spaced out  

`;
    const block = parseBlock(raw);
    assert.equal(block.content, "spaced out");
  });

  it("uses defaults for missing frontmatter fields", () => {
    const raw = `---
{}
---
content`;
    const block = parseBlock(raw);
    assert.equal(block.description, "");
    assert.equal(block.limit, 2000);
  });

  it("handles empty content", () => {
    const raw = `---
description: empty
limit: 100
---
`;
    const block = parseBlock(raw);
    assert.equal(block.content, "");
  });

  it("preserves multiline content", () => {
    const raw = `---
description: multi
limit: 2000
---
line one
line two
line three`;
    const block = parseBlock(raw);
    assert.equal(block.content, "line one\nline two\nline three");
  });
});

// --- serializeBlock ---

describe("serializeBlock", () => {
  it("round-trips through parseBlock", () => {
    const serialized = serializeBlock(sampleBlock);
    const parsed = parseBlock(serialized);
    assert.equal(parsed.description, sampleBlock.description);
    assert.equal(parsed.limit, sampleBlock.limit);
    assert.equal(parsed.content, sampleBlock.content);
  });

  it("produces valid frontmatter format", () => {
    const result = serializeBlock(sampleBlock);
    assert.ok(result.startsWith("---\n"));
    assert.ok(result.includes("description: Test block"));
    assert.ok(result.includes("limit: 100"));
    assert.ok(result.includes("hello world"));
  });

  it("handles empty content", () => {
    const block: Block = { description: "empty", limit: 100, content: "" };
    const serialized = serializeBlock(block);
    const parsed = parseBlock(serialized);
    assert.equal(parsed.content, "");
    assert.equal(parsed.description, "empty");
  });
});

// --- getMemoryDir ---

describe("getMemoryDir", () => {
  it("returns .pi/memory-blocks under the given cwd", () => {
    const result = getMemoryDir("/some/project");
    assert.equal(result, path.join("/some/project", ".pi", "memory-blocks"));
  });
});

// --- File system operations ---

describe("listBlockKeys", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanUp(tmpDir);
  });

  it("returns empty array for non-existent directory", () => {
    const keys = listBlockKeys(path.join(tmpDir, "nope"));
    assert.deepEqual(keys, []);
  });

  it("returns keys for .md files", () => {
    fs.writeFileSync(path.join(tmpDir, "user.md"), "---\n---\n");
    fs.writeFileSync(path.join(tmpDir, "agent.md"), "---\n---\n");
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "not a block");

    const keys = listBlockKeys(tmpDir);
    assert.ok(keys.includes("user"));
    assert.ok(keys.includes("agent"));
    assert.ok(!keys.includes("notes"));
    assert.equal(keys.length, 2);
  });
});

describe("readBlock / writeBlock", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanUp(tmpDir);
  });

  it("writes and reads back a block", () => {
    writeBlock(tmpDir, "test", sampleBlock);
    const result = readBlock(tmpDir, "test");
    assert.equal(result.description, sampleBlock.description);
    assert.equal(result.limit, sampleBlock.limit);
    assert.equal(result.content, sampleBlock.content);
  });

  it("overwrites an existing block", () => {
    writeBlock(tmpDir, "test", sampleBlock);
    const updated: Block = { ...sampleBlock, content: "updated content" };
    writeBlock(tmpDir, "test", updated);
    const result = readBlock(tmpDir, "test");
    assert.equal(result.content, "updated content");
  });
});

describe("readAllBlocks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanUp(tmpDir);
  });

  it("returns empty array for non-existent directory", () => {
    const blocks = readAllBlocks(path.join(tmpDir, "nope"));
    assert.deepEqual(blocks, []);
  });

  it("reads all blocks in the directory", () => {
    writeBlock(tmpDir, "alpha", { ...sampleBlock, content: "aaa" });
    writeBlock(tmpDir, "beta", { ...sampleBlock, content: "bbb" });

    const blocks = readAllBlocks(tmpDir);
    assert.equal(blocks.length, 2);

    const keys = blocks.map((b) => b.key).sort();
    assert.deepEqual(keys, ["alpha", "beta"]);

    const alpha = blocks.find((b) => b.key === "alpha");
    assert.equal(alpha?.block.content, "aaa");
  });
});

// --- ensureDefaults ---

describe("ensureDefaults", () => {
  let tmpDir: string;
  let memDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    memDir = path.join(tmpDir, "memory-blocks");
  });

  afterEach(() => {
    cleanUp(tmpDir);
  });

  it("creates the directory and default blocks", () => {
    assert.ok(!fs.existsSync(memDir));
    ensureDefaults(memDir);
    assert.ok(fs.existsSync(memDir));

    const keys = listBlockKeys(memDir).sort();
    assert.deepEqual(keys, ["agent", "user"]);

    const user = readBlock(memDir, "user");
    assert.equal(user.description, DEFAULT_MEMORY_BLOCKS.user.description);
    assert.equal(user.limit, DEFAULT_MEMORY_BLOCKS.user.limit);
    assert.equal(user.content, "");
  });

  it("does not overwrite existing blocks", () => {
    fs.mkdirSync(memDir, { recursive: true });
    const customUser: Block = {
      description: "Custom user",
      limit: 500,
      content: "existing data",
    };
    writeBlock(memDir, "user", customUser);

    ensureDefaults(memDir);

    const user = readBlock(memDir, "user");
    assert.equal(user.description, "Custom user");
    assert.equal(user.content, "existing data");
    assert.equal(user.limit, 500);

    // But agent should be created
    const agent = readBlock(memDir, "agent");
    assert.equal(agent.description, DEFAULT_MEMORY_BLOCKS.agent.description);
  });
});

// --- renderMemoryBlock ---

describe("renderMemoryBlock", () => {
  it("renders XML-like block markup", () => {
    const entry: BlockEntry = { key: "user", block: sampleBlock };
    const result = renderMemoryBlock(entry);

    assert.ok(result.includes("<user>"));
    assert.ok(result.includes("</user>"));
    assert.ok(result.includes("<description>Test block</description>"));
    assert.ok(result.includes("char-limit=100"));
    assert.ok(result.includes(`char-count=${sampleBlock.content.length}`));
    assert.ok(result.includes("hello world"));
  });

  it("reports char-count=0 for empty content", () => {
    const entry: BlockEntry = {
      key: "agent",
      block: { description: "empty", limit: 2000, content: "" },
    };
    const result = renderMemoryBlock(entry);
    assert.ok(result.includes("char-count=0"));
  });
});

// --- renderMemorySystemPrompt ---

describe("renderMemorySystemPrompt", () => {
  it("wraps blocks in memory_blocks tags", () => {
    const entries: BlockEntry[] = [
      { key: "user", block: { ...sampleBlock, content: "user info" } },
      { key: "agent", block: { ...sampleBlock, content: "agent info" } },
    ];
    const result = renderMemorySystemPrompt(entries);

    assert.ok(result.includes("<memory_blocks>"));
    assert.ok(result.includes("</memory_blocks>"));
    assert.ok(result.includes("<user>"));
    assert.ok(result.includes("<agent>"));
    assert.ok(result.includes("updateMemory"));
  });

  it("includes instructions for the LLM", () => {
    const result = renderMemorySystemPrompt([]);
    assert.ok(result.includes("persistent memory blocks"));
    assert.ok(result.includes("survive across sessions"));
  });
});
