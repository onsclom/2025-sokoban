/* what if i generate 10,000 levels, then pick the ones with the highest manhattan distances? */
import { generateLevel } from "../sokoban";

const attemptLevels = 10000;
const levels = [];
const levelsToSave = 10;

console.time("level generation");
{
  // generation
  for (let i = 0; i < attemptLevels; i++) {
    const level = generateLevel({
      width: 10,
      height: 10,
      boxAmount: 6,
      generationMoves: 150,
    });
    let puzzleRating = 0;
    // for each box, find the manhattan distance to the nearest goal
    for (const box of level.dynamic.boxes) {
      let nearestGoalDistance = Infinity;
      for (const goal of level.static.goals) {
        const distance = Math.abs(box.x - goal.x) + Math.abs(box.y - goal.y);
        if (distance < nearestGoalDistance) {
          nearestGoalDistance = distance;
        }
      }
      puzzleRating += nearestGoalDistance;
    }
    // add the amount of walls to the puzzle rating
    puzzleRating += level.static.walls.length * 0.2;

    if (
      levels.length < levelsToSave ||
      puzzleRating > levels[levelsToSave - 1]!.puzzleRating
    ) {
      levels.push({
        level,
        puzzleRating,
      });
    }
  }

  levels.sort((a, b) => b.puzzleRating - a.puzzleRating);

  const topLevels = levels.slice(0, levelsToSave).map((l) => l.level);
  const levelFile = Bun.file("src/generator/top-levels.json");
  levelFile.write(JSON.stringify(topLevels, null));
}
console.timeEnd("level generation");
