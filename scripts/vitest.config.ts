import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineProject } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(projectRoot, "..");

export default defineProject({
  test: {
    name: "@brandblitz/scripts",
    root: repoRoot,
    environment: "node",
    include: ["scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["scripts/dev.ts"],
      reportsDirectory: "./coverage/scripts",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
