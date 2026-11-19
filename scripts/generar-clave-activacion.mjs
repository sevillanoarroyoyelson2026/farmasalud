#!/usr/bin/env node
/**
 * Genera el hash SHA-256 de una clave de activación.
 *
 * Uso:
 *   node scripts/generar-clave-activacion.mjs "MI-CLAVE-SECRETA"
 *
 * Copia el hash que imprime y pégalo en:
 *   netlify/lib/system-activation.ts  →  EXPECTED_LICENSE_KEY_HASH
 *
 * Luego, para ACTIVAR el sistema, define en Netlify la variable de entorno:
 *   SYSTEM_LICENSE_KEY = MI-CLAVE-SECRETA
 * y vuelve a desplegar. Para DESACTIVARLO, borra esa variable y redespliega.
 *
 * La clave NUNCA debe guardarse en el código ni en el repositorio: solo tú la conoces.
 */
import { createHash } from 'node:crypto';

const key = process.argv[2];
if (!key) {
  console.error('Falta la clave. Ejemplo:\n  node scripts/generar-clave-activacion.mjs "MI-CLAVE-SECRETA"');
  process.exit(1);
}

const hash = createHash('sha256').update(key, 'utf8').digest('hex');
console.log('\nClave (guárdala tú, NO la subas al repo):\n  ' + key);
console.log('\nHash (pégalo en system-activation.ts → EXPECTED_LICENSE_KEY_HASH):\n  ' + hash + '\n');
