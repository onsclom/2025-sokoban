import classicLevelsTxt from "./classic.txt" with { type: "text" };
import { levelFromText } from "../sokoban";

// todo: do this as a prebuild generate step

export function parseLevels(levelsTxt: string) {
  const levelChunks = levelsTxt.trim().split("\n\n");

  // first chunk is metadata, skip it
  levelChunks.shift();

  const levels = [] as {
    name: string;
    level: ReturnType<typeof levelFromText>;
  }[];

  // last line of chunk is level name
  for (const chunk of levelChunks) {
    const lines = chunk.split("\n");
    // name starts with "Title: "
    const name = lines.pop()!.trim().replace("Title: ", "");
    const levelText = lines.join("\n");
    const level = levelFromText(levelText);

    // remove grounds that are outside walls
    // do floodfill for all places player can reach within walls
    // those are the floors
    const seen = new Set<string>();
    const toVisit = [level.dynamic.player];
    const isWall = (x: number, y: number) =>
      level.static.walls.some((wall) => wall.x === x && wall.y === y);
    while (toVisit.length > 0) {
      const pos = toVisit.pop()!;
      const key = `${pos.x},${pos.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // visit neighbors
      const neighbors = [
        { x: pos.x + 1, y: pos.y },
        { x: pos.x - 1, y: pos.y },
        { x: pos.x, y: pos.y + 1 },
        { x: pos.x, y: pos.y - 1 },
      ];
      for (const neighbor of neighbors) {
        if (
          !isWall(neighbor.x, neighbor.y) &&
          !seen.has(`${neighbor.x},${neighbor.y}`)
        ) {
          toVisit.push(neighbor);
        }
      }
    }

    // now seen has all reachable positions
    const newFloors = Array.from(seen).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y } as { x: number; y: number };
    });
    level.static.floors = newFloors;

    levels.push({ name, level });
  }

  return levels;
}

export const classicLevels = parseLevels(classicLevelsTxt);
