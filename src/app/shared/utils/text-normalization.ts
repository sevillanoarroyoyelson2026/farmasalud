/**
 * Convierte un texto en un identificador legible para Firestore.
 * "Botica El Bosque" → "botica-el-bosque"
 */
export function createSlugFromText(text: string): string {
  return normalizeTextForSearch(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Minúsculas y sin tildes, para que "ibuprofeno" encuentre "IBUPROFÉNO". */
export function normalizeTextForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
