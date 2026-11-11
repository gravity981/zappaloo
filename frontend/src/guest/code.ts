// The invitation code as typed in six boxes (UX decision 1).
export const CODE_LENGTH = 6;

/** The characters of a typed or pasted code: capitals, without dashes and spaces. */
export function cleanCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
