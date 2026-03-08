/** Is value a slug? */
export const isSlug = (value: string): boolean => {
  return value === toSlug(value);
};

/** Convert value to a slug (lower kebab-case string with underscores allowed) */
export const toSlug = (value: string): string | undefined => {
  const slug = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
  return slug || undefined;
};
