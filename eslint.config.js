import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Configuração flat do ESLint 9. Todos os plugins são de lint e vivem em
// devDependencies; nada de runtime foi instalado.
export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "_bmad/**",
      "_bmad-output/**",
      // Instantâneo congelado do baseline: é evidência, não código do projeto.
      "verificacao/baseline/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // `no-unused-vars` do núcleo não enxerga JSX: `<motion.div>` e `<Icon />`
      // seriam reportados como imports mortos. Estas duas regras registram o
      // uso em JSX — é correção de leitura, não afrouxamento do lint.
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      // Sem `varsIgnorePattern` global: com o uso em JSX já registrado, isentar
      // todo nome capitalizado só esconderia import morto de verdade.
      // `_` continua sendo a marca idiomática de parâmetro e erro ignorados.
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Código de aplicação roda no navegador.
    files: ["src/**/*.{js,jsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Ferramentas, funções de servidor e configuração rodam no Node.
    // `api/**` é a função de escrita da Story 2.5: ela lê `process.env` e usa o
    // `fetch` global do runtime, e sem os globais de Node o lint a reprovaria
    // por `no-undef` em cima de código correto.
    files: [
      "scripts/**/*.{js,mjs}",
      "api/**/*.{js,mjs}",
      "*.config.js",
      "*.config.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Exceções nominais e temporárias. Estes arquivos estão fora do escopo da
    // Story 1.1 (fronteira do Épico 1) e não podem ser alterados aqui; cada
    // exceção nomeia o símbolo exato, ancorado no fim, e sai quando o arquivo
    // for tocado por uma story que tenha permissão de editá-lo.
    files: ["src/pages/Sobre.jsx"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^(palestra1|consultoria5)$",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/pages/Blog.jsx"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^(Badge)$",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
