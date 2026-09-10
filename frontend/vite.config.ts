import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: "../public",
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } },
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: "../frontend-dist", emptyOutDir: true },
});
