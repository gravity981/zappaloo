// The layers of a Tiled map as the platform reads them: group layers are read recursively, in the order
// of the file, so every tile layer and object layer is visited once (sw-architecture.md 14.4, MAP-02).
import type { TiledLayer, TiledObjectLayer, TiledTileLayer } from "@zappaloo/shared";

/** The tile and object layers of a map, group layers flattened, in the order of the file. */
export function flattenLayers(layers: TiledLayer[]): (TiledTileLayer | TiledObjectLayer)[] {
  return layers.flatMap((layer) => {
    if (layer.type === "group") return flattenLayers(layer.layers);
    return [layer];
  });
}
