/** The base of the world's files for an import id (MAP-10). Its own module, so the avatar editor does not load the engine. */
export function worldBase(version: string): string {
  return `/api/world/${version}`;
}
