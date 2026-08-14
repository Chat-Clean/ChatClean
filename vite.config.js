import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // `true` (booleano) é o que libera qualquer host no Vite 6. A string
    // "all" é tratada como uma LISTA DE UM ITEM chamada "all", e todo
    // hostname que não fosse literalmente `all` recebia `403 Blocked request`
    // — verificado.
    allowedHosts: true,
  },
});
