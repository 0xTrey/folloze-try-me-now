import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/lib/observability.ts"],
    rules: {
      "no-console": "error"
    }
  },
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "test-results/**"])
]);
