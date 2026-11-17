// Tap-to-move (GAME-10): a path over the cells of the map, around everything that blocks (sw-architecture.md
// 3.5). A* with eight neighbours on the tile grid: the four of them along a row or a column are the diagonals of
// the screen, the four diagonal ones are the screen's horizontals and verticals (GAME-22). A diagonal step costs
// √2 and is taken only when both cells beside it are free, so a path never cuts the corner of an obstacle. The
// goal cell is always allowed, so a portal or a point next to an obstacle can be reached.

export interface Cell {
  column: number;
  row: number;
}

export interface Grid {
  columns: number;
  rows: number;
  /** Whether a cell can be walked on (the goal is exempt). */
  walkable: (cell: Cell) => boolean;
  /** Whether a step between two neighbouring cells is possible; a step that is not passable is never taken. */
  passable?: (from: Cell, to: Cell) => boolean;
}

/** The steps to the eight neighbours of a cell, as column and row differences. */
const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

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

/** The cell's key in sets and maps. */
export function cellKey(cell: Cell): string {
  return key(cell);
}

function insideGrid(grid: Grid, cell: Cell): boolean {
  return cell.column >= 0 && cell.row >= 0 && cell.column < grid.columns && cell.row < grid.rows;
}

/**
 * The steps from a cell: to each of the eight neighbours that is inside the map, not already `seen` (keys), walkable
 * (the `goal` is exempt) and passable, and, for a diagonal step, with both cells beside it free. Both the search and
 * the set of reachable cells use it, so a cell is reachable exactly when a path leads to it.
 */
function stepsFrom(
  grid: Grid,
  current: Cell,
  goal: Cell | undefined,
  seen: ReadonlySet<string>,
): { cell: Cell; cost: number }[] {
  const steps: { cell: Cell; cost: number }[] = [];
  for (const [stepColumn, stepRow] of STEPS) {
    const next = { column: current.column + stepColumn, row: current.row + stepRow };
    if (!insideGrid(grid, next) || seen.has(key(next))) continue;
    const diagonal = stepColumn !== 0 && stepRow !== 0;
    if (diagonal) {
      // No cutting a corner: both cells beside the step must be free.
      const beside = [
        { column: current.column + stepColumn, row: current.row },
        { column: current.column, row: current.row + stepRow },
      ];
      if (beside.some((cell) => !insideGrid(grid, cell) || !grid.walkable(cell))) continue;
    }
    const isGoal = goal !== undefined && key(next) === key(goal);
    if (!isGoal && !grid.walkable(next)) continue;
    if (grid.passable !== undefined && !grid.passable(current, next)) continue;
    steps.push({ cell: next, cost: diagonal ? DIAGONAL : 1 });
  }
  return steps;
}

/** The keys of all cells that a path leads to from `start` (one cell or several), the start included (a flood fill with the steps of the search). */
export function reachableCells(grid: Grid, start: Cell | readonly Cell[]): ReadonlySet<string> {
  const queue: Cell[] = [...startList(start)];
  const reached = new Set<string>(queue.map(key));
  // The queue grows while it is walked through, which a for-of loop over an array allows.
  for (const current of queue) {
    for (const { cell } of stepsFrom(grid, current, undefined, reached)) {
      reached.add(key(cell));
      queue.push(cell);
    }
  }
  return reached;
}

/** The cost of a diagonal step between two cells, where a straight step costs 1. */
const DIAGONAL = Math.SQRT2;

/** One start cell, or several (every one of them costs nothing to start from). */
function startList(start: Cell | readonly Cell[]): readonly Cell[] {
  return "column" in start ? [start] : start;
}

/**
 * The cells from `start` to `goal`, both included, or undefined when the goal cannot be reached. With several start
 * cells, the path begins at the one that leads to the goal best.
 */
export function findPath(
  grid: Grid,
  start: Cell | readonly Cell[],
  goal: Cell,
): Cell[] | undefined {
  if (!insideGrid(grid, goal)) return undefined;
  const starts = startList(start);
  const standing = starts.find((cell) => key(cell) === key(goal));
  if (standing !== undefined) return [standing];
  // The octile distance: the cost of the best path on open ground, so it never overestimates.
  const heuristic = (cell: Cell) => {
    const columns = Math.abs(cell.column - goal.column);
    const rows = Math.abs(cell.row - goal.row);
    return Math.max(columns, rows) + (DIAGONAL - 1) * Math.min(columns, rows);
  };
  const cost = new Map<string, number>(starts.map((cell) => [key(cell), 0]));
  const came = new Map<string, Cell>();
  const open = new Heap();
  for (const cell of starts) open.push(cell, heuristic(cell));
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
    for (const { cell: next, cost: step } of stepsFrom(grid, current, goal, closed)) {
      const nextKey = key(next);
      const nextCost = base + step;
      if (nextCost < (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cost.set(nextKey, nextCost);
        came.set(nextKey, current);
        open.push(next, nextCost + heuristic(next));
      }
    }
  }
  return undefined;
}
