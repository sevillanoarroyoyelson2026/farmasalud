import { describe, expect, it } from 'vitest';
import { createSlugFromText, normalizeTextForSearch } from './text-normalization';

describe('createSlugFromText', () => {
  it('genera un id legible sin tildes ni espacios', () => {
    expect(createSlugFromText('Botica El Bosque')).toBe('botica-el-bosque');
    expect(createSlugFromText('  Analgésicos y Antiinflamatorios ')).toBe('analgesicos-y-antiinflamatorios');
  });

  it('elimina símbolos y guiones sobrantes', () => {
    expect(createSlugFromText('¡Ñandú & Cía!')).toBe('nandu-cia');
  });
});

describe('normalizeTextForSearch', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(normalizeTextForSearch('IBUPROFÉNO')).toBe('ibuprofeno');
  });
});
