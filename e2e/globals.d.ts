// The game test hook, as exposed by frontend/src/game/test-hook.ts in test builds.
declare global {
  interface Window {
    __zappaloo?: { game?: { activeScenes: () => string[] } };
  }
}
export {};
