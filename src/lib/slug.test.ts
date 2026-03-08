import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toSlug } from "./slug.ts";

describe("toSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    assert.equal(toSlug("Hello World"), "hello-world");
  });

  it("removes special characters", () => {
    assert.equal(toSlug("foo@bar!baz"), "foobarbaz");
  });

  it("collapses multiple spaces into single hyphen", () => {
    assert.equal(toSlug("a   b"), "a-b");
  });

  it("trims whitespace", () => {
    assert.equal(toSlug("  hello  "), "hello");
  });

  it("returns undefined for empty string", () => {
    assert.equal(toSlug(""), undefined);
  });

  it("returns undefined for whitespace-only string", () => {
    assert.equal(toSlug("   "), undefined);
  });

  it("returns undefined for special-chars-only string", () => {
    assert.equal(toSlug("@#$"), undefined);
  });

  it("preserves hyphens", () => {
    assert.equal(toSlug("my-agent"), "my-agent");
  });

  it("preserves underscores", () => {
    assert.equal(toSlug("my_agent"), "my_agent");
  });
});
