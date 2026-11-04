// Which version the footer shows (sw-architecture.md 23.6): the version compiled
// into the frontend, or the server's if that only adds a pre-release suffix
// (`-rc.N`, set by the deployment of a release candidate).
export function displayVersion(compiled: string, server?: string): string {
  if (server?.startsWith(`${compiled}-`) && /^-rc\.\d+$/.test(server.slice(compiled.length))) {
    return server;
  }
  return compiled;
}
