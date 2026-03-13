import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("recharts")) {
            return "vendor-recharts";
          }
          if (id.includes("d3-")) {
            return "vendor-d3";
          }
          if (id.includes("date-fns")) {
            return "vendor-date";
          }
          if (id.includes("html2canvas")) {
            return "vendor-html2canvas";
          }
          if (id.includes("jspdf") || id.includes("pdf-lib")) {
            return "vendor-jspdf";
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
