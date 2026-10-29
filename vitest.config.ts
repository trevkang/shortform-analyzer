import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests run ffmpeg and the built CLI as child processes: give them room on a busy machine.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
});
