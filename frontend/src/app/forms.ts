// Reading the fields of a submitted form.
/** The text of a form field ("" if it is missing or not text). */
export function fieldText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
