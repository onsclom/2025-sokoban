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

/*
simple reverse sokoban algorithm:
- start everything as walls
- pick random position for player and boxes (starting box positions will ultimately be the goals for the level)
- move the player with reverse sokoban rules (pulling boxes, delete walls if they player moves into them)
  - prefer moves that don't delete walls
- the end is the starting possition for the level
*/
export function generateLevel(props: {
  width: number;
  height: number;
  boxAmount: number;
  generationMoves: number;
}) {
  const { width, height, boxAmount } = props;
  const level = createLevel();

  if (width < 4 || height < 4) throw new Error("too small!");
  for (let y = 0; y < props.height; y++) {
    for (let x = 0; x < props.width; x++) {
      level.static.walls.push({ x, y });
      level.static.floors.push({ x, y });
    }
  }

  const playerX = Math.floor(Math.random() * (width - 2)) + 1;
  const playerY = Math.floor(Math.random() * (height - 2)) + 1;
  level.dynamic.player = { x: playerX, y: playerY };

  const boxPositions: { x: number; y: number }[] = [];
  while (boxPositions.length < boxAmount) {
    const boxX = Math.floor(Math.random() * (width - 2)) + 1;
    const boxY = Math.floor(Math.random() * (height - 2)) + 1;
    if (
      (boxX === playerX && boxY === playerY) ||
      boxPositions.some((pos) => pos.x === boxX && pos.y === boxY)
    ) {
      continue;
    }
    boxPositions.push({ x: boxX, y: boxY });
  }

  for (const boxPos of boxPositions) {
    level.static.goals.push({ x: boxPos.x, y: boxPos.y });
    level.dynamic.boxes.push({ x: boxPos.x, y: boxPos.y });
  }

  // delete walls at player and box positions
  for (let y = level.static.walls.length - 1; y >= 0; y--) {
    const wall = level.static.walls[y]!;
    if (
      (wall.x === playerX && wall.y === playerY) ||
      boxPositions.some((pos) => pos.x === wall.x && pos.y === wall.y)
    ) {
      level.static.walls.splice(y, 1);
    }
  }

  for (let i = 0; i < props.generationMoves; i++) {
    const possibleMoves = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const legalMoves: { x: number; y: number }[] = [];

    for (const move of possibleMoves) {
      const newPlayerX = level.dynamic.player.x + move.x;
      const newPlayerY = level.dynamic.player.y + move.y;
      // player cant move into perimeter walls
      if (
        newPlayerX <= 0 ||
        newPlayerX >= width - 1 ||
        newPlayerY <= 0 ||
        newPlayerY >= height - 1
      ) {
        continue;
      }
      // player cant move into boxes
      const boxAtNewPos = level.dynamic.boxes.find(
        (box) => box.x === newPlayerX && box.y === newPlayerY,
      );
      if (boxAtNewPos) {
        continue;
      }
      legalMoves.push(move);
    }
    if (legalMoves.length === 0) {
      // got stuck
      return level;
    }
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)]!;
    level.dynamic.player.x += move.x;
    level.dynamic.player.y += move.y;

    // delete wall at new player position
    for (let w = level.static.walls.length - 1; w >= 0; w--) {
      const wall = level.static.walls[w]!;
      if (
        wall.x === level.dynamic.player.x &&
        wall.y === level.dynamic.player.y
      ) {
        level.static.walls.splice(w, 1);
      }
    }

    // if moving away from a box, pull the box
    const boxAtOldPos = level.dynamic.boxes.find(
      (box) =>
        box.x === level.dynamic.player.x - move.x * 2 &&
        box.y === level.dynamic.player.y - move.y * 2,
    );
    if (boxAtOldPos) {
      boxAtOldPos.x += move.x;
      boxAtOldPos.y += move.y;

      // delete wall at new box position
      for (let w = level.static.walls.length - 1; w >= 0; w--) {
        const wall = level.static.walls[w]!;
        if (wall.x === boxAtOldPos.x && wall.y === boxAtOldPos.y) {
          level.static.walls.splice(w, 1);
        }
      }
    }
  }

  return level;
}

function dynamicStateString(dynamic: Level["dynamic"]): string {
  const boxPositions = dynamic.boxes
    .map((box) => `${box.x},${box.y}`)
    .sort()
    .join("|");
  return `${dynamic.player.x},${dynamic.player.y};${boxPositions}`;
}

export function solveLevel(level: Level) {
  // simple sokoban solver using breadth first search
  // push based

  const goalCount = level.static.goals.length;

  const seen = new Set<string>([dynamicStateString(level.dynamic)]);
  const toExplore = [
    {
      state: structuredClone(level.dynamic),
      pushes: 0,
    },
  ];

  let maxMoveSeen = 0;

  while (toExplore.length > 0) {
    const current = toExplore.shift()!;
    // find all possible pushes
    {
      // floodfill to find all reachable positions for the player
      const reachable = new Set<string>();
      const isWall = (x: number, y: number) =>
        level.static.walls.some((wall) => wall.x === x && wall.y === y);
      const isBox = (x: number, y: number) =>
        current.state.boxes.some((box) => box.x === x && box.y === y);
      {
        const toVisit = [current.state.player];
        while (toVisit.length > 0) {
          const pos = toVisit.pop()!;
          const key = `${pos.x},${pos.y}`;
          if (reachable.has(key)) continue;
          reachable.add(key);
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
              !isBox(neighbor.x, neighbor.y) &&
              !reachable.has(`${neighbor.x},${neighbor.y}`)
            ) {
              toVisit.push(neighbor);
            }
          }
        }
      }

      // for each box, see if the player can reach the position behind it to push it
      {
        for (const box of current.state.boxes) {
          const pushDirections = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
          ];
          const oldBoxX = box.x;
          const oldBoxY = box.y;
          for (const dir of pushDirections) {
            const playerPos = {
              x: box.x - dir.x,
              y: box.y - dir.y,
            };
            const newBoxPos = {
              x: box.x + dir.x,
              y: box.y + dir.y,
            };
            // check if player can reach playerPos
            if (!reachable.has(`${playerPos.x},${playerPos.y}`)) {
              continue;
            }
            // check if newBoxPos is free
            if (
              isWall(newBoxPos.x, newBoxPos.y) ||
              isBox(newBoxPos.x, newBoxPos.y)
            ) {
              continue;
            }

            {
              // perform push
              const newState = structuredClone(current.state);
              // move box
              const boxToMove = newState.boxes.find(
                (b) => b.x === oldBoxX && b.y === oldBoxY,
              )!;
              boxToMove.x = newBoxPos.x;
              boxToMove.y = newBoxPos.y;
              // move player
              newState.player.x = oldBoxX;
              newState.player.y = oldBoxY;

              // check if solved
              let boxesOnGoals = 0;
              for (const b of newState.boxes) {
                if (
                  level.static.goals.some((g) => g.x === b.x && g.y === b.y)
                ) {
                  boxesOnGoals++;
                }
              }
              if (boxesOnGoals === goalCount) {
                return current.pushes + 1;
              }

              const stateString = dynamicStateString(newState);
              if (!seen.has(stateString)) {
                seen.add(stateString);
                const newPushes = current.pushes + 1;
                toExplore.push({
                  state: newState,
                  pushes: newPushes,
                });
                if (newPushes > maxMoveSeen) {
                  maxMoveSeen = newPushes;
                  console.log(`max pushes seen: ${maxMoveSeen}`);
                }
              }
            }
          }
        }
      }
    }
  }

  return null; // unsolvable
}
