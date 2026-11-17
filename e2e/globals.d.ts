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
        renderStack: () => { type: string; depth: number }[];
        selectSpawn: (mapId: string, spawn: string) => void;
        setGuides: (guides: {
          collisions: boolean;
          borders: boolean;
          spawns: boolean;
          portals: boolean;
          grid: boolean;
        }) => void;
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
