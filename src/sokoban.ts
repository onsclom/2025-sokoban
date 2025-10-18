export function createLevel() {
  return {
    static: {
      walls: [] as { x: number; y: number }[],
      floors: [] as { x: number; y: number }[],
      goals: [] as { x: number; y: number }[],
    },
    dynamic: {
      boxes: [] as { x: number; y: number }[],
      player: { x: 0, y: 0 },
    },
  };
}

/*
http://www.sokobano.de/wiki/index.php?title=Puzzle_format:
Wall	#	0x23
Player	@	0x40
Player on goal square	+	0x2b
Box	$	0x24
Box on goal square	*	0x2a
Goal square	.	0x2e
Floor	(Space)
*/
const characterToSokoban = {
  "#": "wall",
  "@": "player",
  "+": "playerOnGoal",
  $: "box",
  "*": "boxOnGoal",
  ".": "goal",
  " ": "floor",
};

export const testLevel = `
#########
#       #
#@  $ . #
#       #
#   $ . #
#       #
#########
`.trim();

export function levelFromText(text: string) {
  const level = createLevel();
  const lines = text.split("\n");
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y]!;
    for (let x = 0; x < line.length; x++) {
      const char = line[x]!;
      const type = characterToSokoban[char as keyof typeof characterToSokoban];
      if (type === "wall") {
        level.static.walls.push({ x, y });
      } else if (type === "floor") {
        level.static.floors.push({ x, y });
      } else if (type === "goal") {
        level.static.goals.push({ x, y });
        level.static.floors.push({ x, y });
      } else if (type === "box") {
        level.dynamic.boxes.push({ x, y });
        level.static.floors.push({ x, y });
      } else if (type === "boxOnGoal") {
        level.dynamic.boxes.push({ x, y });
        level.static.goals.push({ x, y });
        level.static.floors.push({ x, y });
      } else if (type === "player") {
        level.dynamic.player = { x, y };
        level.static.floors.push({ x, y });
      } else if (type === "playerOnGoal") {
        level.dynamic.player = { x, y };
        level.static.goals.push({ x, y });
        level.static.floors.push({ x, y });
      } else {
        throw new Error(`Unknown character in level: ${char}`);
      }
    }
  }
  return level;
}

type Level = ReturnType<typeof createLevel>;

export function levelDimensions(level: Level) {
  let width = 0;
  let height = 0;
  // assume walls are enough
  for (const wall of level.static.walls) {
    if (wall.x + 1 > width) width = wall.x + 1;
    if (wall.y + 1 > height) height = wall.y + 1;
  }
  return { width, height };
}
