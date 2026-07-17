import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests target the pure logic modules (lib/*.test.ts). The "@/" alias
// mirrors tsconfig so tests import the same way app code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
