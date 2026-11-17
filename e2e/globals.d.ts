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
              sparkles: number;
              view: { x: number; y: number; zoom: number; width: number; height: number };
            }
          | undefined;
        renderStack: () => { type: string; depth: number }[];
        clickables: () => {
          name: string;
          x: number;
          y: number;
          ax: number;
          ay: number;
          hidden: boolean;
          reachable: boolean;
        }[];
        selectSpawn: (mapId: string, spawn: string) => void;
        setGuides: (guides: {
          collisions: boolean;
          borders: boolean;
          spawns: boolean;
          portals: boolean;
          grid: boolean;
          occlusion: boolean;
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
