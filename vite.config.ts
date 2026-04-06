import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

export default defineConfig({
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  plugins: [react()],
  ...(process.env.INCLUDE_BASE ? { base: "./" } : {}),
  server: {
    allowedHosts: [".local"],
  },
});
