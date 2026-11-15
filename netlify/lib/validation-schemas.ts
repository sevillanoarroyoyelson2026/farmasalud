import { z } from 'zod';

/** Reglas de validación reutilizadas por varias functions. */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128)
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'Debe tener letras')
  .regex(/\d/, 'Debe tener números');

export const firestoreDocumentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identificador no válido');

export const userRoleSchema = z.enum(['admin', 'worker', 'customer']);
export const staffRoleSchema = z.enum(['admin', 'worker']);
