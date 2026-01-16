import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Development scripts
    "scripts/**",
  ]),
  // Disable set-state-in-effect for timer hooks and settings (setState for state sync is intentional)
  {
    files: [
      "src/hooks/useCallingTimer.ts",
      "src/hooks/useTurnTimer.ts",
      "src/components/SettingsModal.tsx",
      "src/app/room/*/page.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
