import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineProject } from "vitest/config";
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./src"),
    },
  },
  test: {
    name: "@brandblitz/web",
    root: projectRoot,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/components/game/result-screen.tsx",
        "src/components/game/warmup-phase.tsx",
      ],
      reporter: ["text", "lcov"],
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
      reporter: ["text", "json", "html"],
      include: ["src/components/game/countdown-timer.tsx"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95
      }
    }
  },
});
