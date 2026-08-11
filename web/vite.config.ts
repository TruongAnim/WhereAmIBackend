import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Firebase and Leaflet are big enough that splitting them keeps the app
    // chunk small and cacheable across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          leaflet: ["leaflet"],
        },
      },
    },
  },
});
