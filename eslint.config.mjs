import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/data",
              allowTypeImports: true,
              message: "Import runtime API clients from their focused @/data/<domain> entrypoint.",
            },
            {
              name: "@phosphor-icons/react",
              message: "Import icons from their focused @phosphor-icons/react/<Icon> entrypoint.",
            },
          ],
        },
      ],
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/display-name": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "build/**",
    "next-env.d.ts",
    "out/**",
    "wireframe/**",
  ]),
]);
