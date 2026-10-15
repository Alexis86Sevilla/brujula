import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", ".claude/", "docs/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.mjs", "scripts/**/*.js"],
    languageOptions: { globals: globals.node },
  },
);
