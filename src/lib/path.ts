import path from "node:path";

/** Get the stem of a path (filename sans extension) */
export const stem = (filePath: string): string => {
  return path.basename(filePath, path.extname(filePath));
};
