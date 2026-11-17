// Tap-to-move (GAME-10): a path over the cells of the map, around everything that blocks (sw-architecture.md
// 3.5). A* with four neighbours on the tile grid, which are the diagonals of the screen. The goal cell is
// always allowed, so a portal or a point next to an obstacle can be reached.

export interface Cell {
  column: number;
  row: number;
}

export interface Grid {
  columns: number;
  rows: number;
  /** Whether a cell can be walked on (the goal is exempt). */
  walkable: (cell: Cell) => boolean;
}

function key(cell: Cell): string {
  return `${String(cell.column)},${String(cell.row)}`;
}

/** A minimal binary heap of cells, the lowest score first. */
class Heap {
  readonly #items: { cell: Cell; score: number }[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(cell: Cell, score: number): void {
    const items = this.#items;
    items.push({ cell, score });
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const up = items[parent];
      const down = items[index];
      if (up === undefined || down === undefined || up.score <= down.score) break;
      items[parent] = down;
      items[index] = up;
      index = parent;
    }
  }

  pop(): Cell | undefined {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) return undefined;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        const current = items[smallest];
        const leftItem = items[left];
        const rightItem = items[right];
        if (current !== undefined && leftItem !== undefined && leftItem.score < current.score)
          smallest = left;
        const best = items[smallest];
        if (best !== undefined && rightItem !== undefined && rightItem.score < best.score)
          smallest = right;
        if (smallest === index) break;
        const swapA = items[index];
        const swapB = items[smallest];
        if (swapA === undefined || swapB === undefined) break;
        items[index] = swapB;
        items[smallest] = swapA;
        index = smallest;
      }
    }
    return top.cell;
  }
}

/** The cells from `start` to `goal`, both included, or undefined when the goal cannot be reached. */
export function findPath(grid: Grid, start: Cell, goal: Cell): Cell[] | undefined {
  const inside = (cell: Cell) =>
    cell.column >= 0 && cell.row >= 0 && cell.column < grid.columns && cell.row < grid.rows;
  if (!inside(goal)) return undefined;
  if (key(start) === key(goal)) return [start];
  const heuristic = (cell: Cell) =>
    Math.abs(cell.column - goal.column) + Math.abs(cell.row - goal.row);
  const cost = new Map<string, number>([[key(start), 0]]);
  const came = new Map<string, Cell>();
  const open = new Heap();
  open.push(start, heuristic(start));
  const closed = new Set<string>();
  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    const currentKey = key(current);
    if (closed.has(currentKey)) continue;
    if (currentKey === key(goal)) {
      const path: Cell[] = [current];
      let previous = came.get(currentKey);
      while (previous !== undefined) {
        path.unshift(previous);
        previous = came.get(key(previous));
      }
      return path;
    }
    closed.add(currentKey);
    const base = cost.get(currentKey) ?? 0;
    const neighbours: Cell[] = [
      { column: current.column + 1, row: current.row },
      { column: current.column - 1, row: current.row },
      { column: current.column, row: current.row + 1 },
      { column: current.column, row: current.row - 1 },
    ];
    for (const next of neighbours) {
      if (!inside(next)) continue;
      const nextKey = key(next);
      if (closed.has(nextKey)) continue;
      const isGoal = nextKey === key(goal);
      if (!isGoal && !grid.walkable(next)) continue;
      const nextCost = base + 1;
      if (nextCost < (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cost.set(nextKey, nextCost);
        came.set(nextKey, current);
        open.push(next, nextCost + heuristic(next));
      }
    }
  }
  return undefined;
}
