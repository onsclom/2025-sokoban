import { levelDimensions, levelFromText, testLevel } from "./sokoban";
import * as Camera from "./camera";
import * as Input from "./input";
import { playStepSound } from "./sound";

// sokoban
const animationSpeed = 0.02;

const initState = {
  level: levelFromText(testLevel),
  animation: {
    initialized: false,
    boxes: [] as { x: number; y: number; tint: number }[],
    player: { x: 0, y: 0 },
  },
  camera: Camera.create(),
};

const state = structuredClone(initState);

export function tick(ctx: CanvasRenderingContext2D, dt: number) {
  if (
    Input.keysJustPressed.has("d") ||
    Input.keysJustPressed.has("ArrowRight")
  ) {
    attemptMovePlayer(1, 0);
  } else if (
    Input.keysJustPressed.has("a") ||
    Input.keysJustPressed.has("ArrowLeft")
  ) {
    attemptMovePlayer(-1, 0);
  } else if (
    Input.keysJustPressed.has("w") ||
    Input.keysJustPressed.has("ArrowUp")
  ) {
    attemptMovePlayer(0, -1);
  } else if (
    Input.keysJustPressed.has("s") ||
    Input.keysJustPressed.has("ArrowDown")
  ) {
    attemptMovePlayer(0, 1);
  }

  if (!state.animation.initialized) {
    state.animation.initialized = true;
    state.animation.player.x = state.level.dynamic.player.x;
    state.animation.player.y = state.level.dynamic.player.y;
    state.animation.boxes = state.level.dynamic.boxes.map((box) => ({
      x: box.x,
      y: box.y,
      tint: 0,
    }));
  }

  {
    // animate things
    for (let i = 0; i < state.animation.boxes.length; i++) {
      const box = state.animation.boxes[i]!;
      const targetBox = state.level.dynamic.boxes[i]!;

      box.x = lerp(box.x, targetBox.x, 1 - Math.exp(-animationSpeed * dt));
      box.y = lerp(box.y, targetBox.y, 1 - Math.exp(-animationSpeed * dt));

      const boxOnGoal = state.level.static.goals.some(
        (goal) => goal.x === targetBox.x && goal.y === targetBox.y,
      );
      const targetBoxTint = boxOnGoal ? 1 : 0;
      box.tint = lerp(
        box.tint,
        targetBoxTint,
        1 - Math.exp(-animationSpeed * dt),
      );
    }

    const targetPlayer = state.level.dynamic.player;
    state.animation.player.x = lerp(
      state.animation.player.x,
      targetPlayer.x,
      1 - Math.exp(-animationSpeed * dt),
    );
    state.animation.player.y = lerp(
      state.animation.player.y,
      targetPlayer.y,
      1 - Math.exp(-animationSpeed * dt),
    );
  }

  ctx.fillStyle = "#88f";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const levelSize = levelDimensions(state.level);

  state.camera.zoom =
    Camera.aspectFitZoom(
      ctx.canvas.getBoundingClientRect(),
      levelSize.width,
      levelSize.height,
    ) * 0.9;

  // draw sokoban
  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    // by default at (0, 0)
    ctx.translate(-levelSize.width / 2, -levelSize.height / 2);

    // draw floor
    for (const floor of state.level.static.floors) {
      ctx.fillStyle = "green";
      ctx.fillRect(floor.x, floor.y, 1, 1);
    }

    {
      const shadowOffset = 0.1;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";

      for (const wall of state.level.static.walls) {
        ctx.fillRect(wall.x + shadowOffset, wall.y + shadowOffset, 1, 1);
      }
      for (const box of state.animation.boxes) {
        ctx.fillRect(box.x + shadowOffset, box.y + shadowOffset, 1, 1);
      }
      const player = state.animation.player;
      ctx.beginPath();
      ctx.arc(
        player.x + 0.5 + shadowOffset,
        player.y + 0.5 + shadowOffset,
        0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // draw walls
    for (const wall of state.level.static.walls) {
      ctx.fillStyle = "gray";
      ctx.fillRect(wall.x, wall.y, 1, 1);
    }

    // draw goals
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 0.1;
    for (const goal of state.level.static.goals) {
      ctx.strokeRect(goal.x + 0.2, goal.y + 0.2, 0.6, 0.6);
    }

    // draw boxes
    // console.log(state.animation.boxes);
    for (const box of state.animation.boxes) {
      ctx.fillStyle = "#895129";
      ctx.fillRect(box.x, box.y, 1, 1);

      // draw gold tint above box
      ctx.globalAlpha = box.tint * 0.5;
      ctx.fillStyle = "yellow";
      ctx.fillRect(box.x, box.y, 1, 1);
      ctx.globalAlpha = 1;
    }

    // draw player
    {
      const player = state.animation.player;
      ctx.fillStyle = "#eee";
      ctx.beginPath();
      ctx.arc(player.x + 0.5, player.y + 0.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  Input.resetInput();
}

function attemptMovePlayer(dx: number, dy: number) {
  const player = state.level.dynamic.player;
  const targetX = player.x + dx;
  const targetY = player.y + dy;

  // check for wall collision
  const wallExists = state.level.static.walls.some(
    (wall) => wall.x === targetX && wall.y === targetY,
  );

  if (wallExists) {
    // INVALID
    return;
  }

  const boxExists = state.level.dynamic.boxes.findIndex(
    (box) => box.x === targetX && box.y === targetY,
  );
  if (boxExists !== -1) {
    // try to move box
    const boxTargetX = targetX + dx;
    const boxTargetY = targetY + dy;

    const wallExistsForBox = state.level.static.walls.some(
      (wall) => wall.x === boxTargetX && wall.y === boxTargetY,
    );
    if (wallExistsForBox) {
      // INVALID
      return;
    }
    const boxExistsForBox = state.level.dynamic.boxes.some(
      (box) => box.x === boxTargetX && box.y === boxTargetY,
    );
    if (boxExistsForBox) {
      // INVALID
      return;
    }

    // move box
    state.level.dynamic.boxes[boxExists]!.x = boxTargetX;
    state.level.dynamic.boxes[boxExists]!.y = boxTargetY;
  }

  // if still here, make move
  player.x = targetX;
  player.y = targetY;

  playStepSound();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
