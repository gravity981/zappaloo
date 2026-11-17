// The game test hook, as exposed by frontend/src/game/test-hook.ts in test builds.
declare global {
  interface Window {
    __zappaloo?: {
      game?: {
        activeScenes: () => string[];
        state: () =>
          | {
              mapId: string;
              x: number;
              y: number;
              direction: string;
              view: { x: number; y: number; zoom: number; width: number; height: number };
            }
          | undefined;
        renderArtwork: (
          mapId: string,
          width: number,
          height: number,
          zoom?: number,
          nativeObjects?: boolean,
        ) => Promise<void>;
      };
    };
  }
}
export {};
