/**
 * 게임에 넣을 라이브러리 빌드. 편집기 앱 빌드(`vite.config.ts`)와 별개다.
 *
 * 여기서 나오는 것만 npm에 올라간다. 편집기 · UI · Phaser는 들어가지 않는다.
 */
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist-lib",
    emptyOutDir: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/runtime/index.ts", import.meta.url)),
        phaser: fileURLToPath(new URL("./src/runtime/phaser.ts", import.meta.url)),
      },
      formats: ["es"],
    },
    rollupOptions: {
      // 게임 쪽이 이미 들고 있는 것은 번들에 넣지 않는다.
      external: ["phaser"],
    },
  },
});
