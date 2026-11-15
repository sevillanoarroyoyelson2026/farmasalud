import { defineConfig } from 'vitest/config';

/** Configuración solo para las pruebas de reglas de Firestore (corren contra el emulador). */
export default defineConfig({
  test: {
    include: ['tests/firestore-rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
