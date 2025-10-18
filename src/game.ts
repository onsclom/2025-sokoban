import {
  generateLevel,
  levelDimensions,
  levelFromText,
  testLevel,
} from "./sokoban";
import stoneSpecs from "./generator/stone-specs.json";

import * as Camera from "./camera";
import * as Input from "./input";
import { playInvalidMoveSound, playStepSound } from "./sound";

import { classicLevels } from "./levels/parse-levels";

// sokoban
const animationSpeed = 0.02;

const initAnimation = {
  initialized: false,
  boxes: [] as { x: number; y: number; tint: number }[],
  player: { x: 0, y: 0 },
  playerXScale: 1,
  playerYScale: 1,

  cameraOffset: { x: 0, y: 0 },

  lastDirection: { x: 0, y: 0 },
  eyesLooking: { x: 0, y: 0 },

  happinessTarget: 0.5,
  animatedHappines: 0.5,

  undoTransparency: 0,

  timeTillNextBlink: 3000 + Math.random() * 2000, // 3-5 seconds initially
  isBlinking: false,
};

const keyRepeatDelay = 250;
const keyRepeatInterval = 115;

const initState = {
  level: structuredClone(classicLevels[0]!.level),
  undoStack: [] as ReturnType<typeof generateLevel>["dynamic"][],

  curClassicIndex: 0,

  animation: structuredClone(initAnimation),
  camera: Camera.create(),

  keyRepeat: {
    lastDir: { x: 0, y: 0 },
    timeHeld: 0,
    repeats: 0,
  },
};

const state = structuredClone(initState);

// const stoneSpecs = [] as { x: number; y: number; size: number }[];
// const stoneSpecCount = 8;
// for (let i = 0; i < stoneSpecCount; i++) {
//   stoneSpecs.push({
//     x: Math.random(),
//     y: Math.random(),
//     size: Math.random() * 0.15 + 0.05,
//   });
// }

function loadLevel() {
  state.level = classicLevels[state.curClassicIndex]!.level;
  state.animation = structuredClone(initAnimation); // reset animation
  state.undoStack = [];
}

export function tick(ctx: CanvasRenderingContext2D, dt: number) {
  state.animation.timeTillNextBlink -= dt;

  if (state.animation.isBlinking) {
    if (state.animation.timeTillNextBlink <= 0) {
      state.animation.isBlinking = false;
      state.animation.timeTillNextBlink = 3000 + Math.random() * 2000;
    }
  } else {
    if (state.animation.timeTillNextBlink <= 0) {
      state.animation.isBlinking = true;
      state.animation.timeTillNextBlink = 150; // Blink duration
    }
  }

  if (Input.keysJustPressed.has("q")) {
    state.curClassicIndex -= 1;
    if (state.curClassicIndex < 0) {
      state.curClassicIndex = classicLevels.length - 1;
    }
    loadLevel();
  }
  if (Input.keysJustPressed.has("e")) {
    state.curClassicIndex += 1;
    if (state.curClassicIndex >= classicLevels.length) {
      state.curClassicIndex = 0;
    }
    loadLevel();
  }

  if (Input.keysJustPressed.has("z") || Input.keysJustPressed.has("u")) {
    // undo
    if (state.undoStack.length === 0) {
      playInvalidMoveSound();
      state.animation.isBlinking = true;
      state.animation.timeTillNextBlink = 150;
    } else {
      const lastState = state.undoStack.pop()!;
      state.level.dynamic = structuredClone(lastState);
      playStepSound();
      state.animation.happinessTarget = 0.5;
      state.animation.undoTransparency = 1.0;
    }
  }

  state.animation.cameraOffset.x = lerp(
    state.animation.cameraOffset.x,
    0,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.cameraOffset.y = lerp(
    state.animation.cameraOffset.y,
    0,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.eyesLooking.x = lerp(
    state.animation.eyesLooking.x,
    state.animation.lastDirection.x,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.eyesLooking.y = lerp(
    state.animation.eyesLooking.y,
    state.animation.lastDirection.y,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.animatedHappines = lerp(
    state.animation.animatedHappines,
    state.animation.happinessTarget,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.playerXScale = lerp(
    state.animation.playerXScale,
    1,
    1 - Math.exp(-animationSpeed * dt),
  );
  state.animation.playerYScale = lerp(
    state.animation.playerYScale,
    1,
    1 - Math.exp(-animationSpeed * dt),
  );

  {
    state.animation.undoTransparency -= (dt / 1000) * 2; // fade out over 0.5 seconds
    state.animation.undoTransparency = Math.max(
      0,
      state.animation.undoTransparency,
    );
  }

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

  // handle keyRepeat here
  const curDir = { x: 0, y: 0 };
  if (Input.keysDown.has("d") || Input.keysDown.has("ArrowRight")) {
    curDir.x = 1;
  } else if (Input.keysDown.has("a") || Input.keysDown.has("ArrowLeft")) {
    curDir.x = -1;
  } else if (Input.keysDown.has("w") || Input.keysDown.has("ArrowUp")) {
    curDir.y = -1;
  } else if (Input.keysDown.has("s") || Input.keysDown.has("ArrowDown")) {
    curDir.y = 1;
  }
  if (
    curDir.x === state.keyRepeat.lastDir.x &&
    curDir.y === state.keyRepeat.lastDir.y &&
    (curDir.x !== 0 || curDir.y !== 0)
  ) {
    state.keyRepeat.timeHeld += dt;
    if (state.keyRepeat.timeHeld >= keyRepeatDelay) {
      const oldRepeats = state.keyRepeat.repeats;
      const newRepeats = Math.max(
        0,
        (state.keyRepeat.timeHeld - keyRepeatDelay) / keyRepeatInterval,
      );
      state.keyRepeat.repeats = Math.floor(newRepeats);
      if (oldRepeats !== state.keyRepeat.repeats) {
        attemptMovePlayer(curDir.x, curDir.y);
      }
    }
  } else {
    // new direction or no direction
    state.keyRepeat.lastDir = curDir;
    state.keyRepeat.timeHeld = 0;
    state.keyRepeat.repeats = 0;
  }

  if (Input.keysJustPressed.has("r")) {
    // restart level
    loadLevel();
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
  ctx.fillStyle = "#99f";
  const rect = ctx.canvas.getBoundingClientRect();
  ctx.fillRect(0, 0, rect.width, rect.height);
  const levelSize = levelDimensions(state.level);
  state.camera.zoom =
    Camera.aspectFitZoom(
      ctx.canvas.getBoundingClientRect(),
      levelSize.width,
      levelSize.height,
    ) * 0.75;
  // draw sokoban
  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    ctx.translate(
      state.animation.cameraOffset.x,
      state.animation.cameraOffset.y,
    );

    // center level
    // by default at (0, 0)
    ctx.translate(-levelSize.width / 2, -levelSize.height / 2);
    // draw floor
    for (const floor of state.level.static.floors) {
      ctx.fillStyle = "green";
      ctx.fillRect(floor.x, floor.y, 1, 1);
    }
    {
      const shadowOffset = 0.1;
      ctx.fillStyle = "rgba(0, 0, 0, .6)";
      for (const wall of state.level.static.walls) {
        ctx.fillRect(wall.x + shadowOffset, wall.y + shadowOffset, 1, 1);
      }
      for (const box of state.animation.boxes) {
        ctx.fillRect(box.x + shadowOffset, box.y + shadowOffset, 1, 1);
      }
      const player = state.animation.player;
      ctx.save();
      ctx.translate(
        player.x + 0.5 + shadowOffset,
        player.y + 0.5 + shadowOffset,
      );
      ctx.scale(state.animation.playerXScale, state.animation.playerYScale);
      ctx.beginPath();
      ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // draw walls
    for (const wall of state.level.static.walls) {
      ctx.fillStyle = "gray";
      ctx.fillRect(wall.x, wall.y, 1, 1);

      // draw specs inside wall with clip rect
      ctx.save();
      ctx.beginPath();
      ctx.rect(wall.x, wall.y, 1, 1);
      ctx.clip();
      ctx.fillStyle = "darkgray";

      for (const spec of stoneSpecs) {
        for (const y of [-1, 0, 1]) {
          for (const x of [-1, 0, 1]) {
            ctx.beginPath();
            ctx.ellipse(
              wall.x + spec.x + x,
              wall.y + spec.y + y,
              spec.size,
              spec.size,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
      }

      ctx.restore();
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
      ctx.save();
      ctx.translate(player.x + 0.5, player.y + 0.5);
      ctx.scale(state.animation.playerXScale, state.animation.playerYScale);
      // Draw body (now relative to 0,0)
      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
      ctx.fill();

      {
        ctx.save();

        if (!state.animation.isBlinking) {
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(-0.2, -0.1 / 1, 0.19, 0, Math.PI * 2);
          ctx.arc(0.2, -0.1 / 1, 0.19, 0, Math.PI * 2);
          ctx.fill();

          // Draw eye pupils with looking animation
          ctx.fillStyle = "black";
          ctx.beginPath();
          ctx.save();
          ctx.translate(
            state.animation.eyesLooking.x * 0.075,
            state.animation.eyesLooking.y * 0.075,
          );
          ctx.arc(-0.2, -0.1, 0.075, 0, Math.PI * 2);
          ctx.arc(0.2, -0.1, 0.075, 0, Math.PI * 2);
          ctx.restore();
          ctx.fill();
        } else {
          // Draw closed eyes (simple lines)
          ctx.strokeStyle = "black";
          ctx.lineWidth = 0.04;
          ctx.beginPath();
          ctx.moveTo(-0.32, -0.1);
          ctx.lineTo(-0.08, -0.1);
          ctx.moveTo(0.08, -0.1);
          ctx.lineTo(0.32, -0.1);
          ctx.stroke();
        }

        ctx.restore();
      }

      const happiness = state.animation.animatedHappines; // from 0 (sad) to 1 (happy)
      ctx.strokeStyle = "black";
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      const mouthWidth = 0.3;
      const mouthY = 0.175;
      // Calculate curve amount based on happiness (negative = frown, positive = smile)
      const curveAmount = (happiness - 0.5) * 0.2;

      ctx.moveTo(-mouthWidth / 2, mouthY);
      ctx.quadraticCurveTo(0, mouthY + curveAmount, mouthWidth / 2, mouthY);
      ctx.stroke();

      // Restore context (removes all transforms)
      ctx.restore();
    }
  });

  ctx.fillStyle = "black";
  const levelName = classicLevels[state.curClassicIndex]!.name;
  const fontSize = 60;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "center";

  {
    // undo text
    ctx.globalAlpha = state.animation.undoTransparency;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = 100;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#f22";
    ctx.fillText("UNDO", rect.width / 2, rect.height - fontSize);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "black";
  const offset = 3;
  ctx.fillText(`${levelName}`, rect.width / 2 + offset, fontSize + offset);
  ctx.fillStyle = "white";
  ctx.fillText(`${levelName}`, rect.width / 2, fontSize);

  Input.resetInput();
}

function attemptMovePlayer(dx: number, dy: number) {
  const previousState = structuredClone(state.level.dynamic);

  const squashAmount = 0.33;
  if (dx !== 0) {
    state.animation.playerXScale *= 1 + squashAmount;
    state.animation.playerYScale *= 1 - squashAmount;
  }
  if (dy !== 0) {
    state.animation.playerYScale *= 1 + squashAmount;
    state.animation.playerXScale *= 1 - squashAmount;
  }

  const player = state.level.dynamic.player;
  const targetX = player.x + dx;
  const targetY = player.y + dy;

  // check for wall collision
  const wallExists = state.level.static.walls.some(
    (wall) => wall.x === targetX && wall.y === targetY,
  );

  let invalid = false;
  if (wallExists) {
    invalid = true;
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
      invalid = true;
    }
    const boxExistsForBox = state.level.dynamic.boxes.some(
      (box) => box.x === boxTargetX && box.y === boxTargetY,
    );
    if (boxExistsForBox) {
      invalid = true;
    }

    // move box
    if (!invalid) {
      state.level.dynamic.boxes[boxExists]!.x = boxTargetX;
      state.level.dynamic.boxes[boxExists]!.y = boxTargetY;
    }
  }

  if (invalid) {
    state.animation.cameraOffset.x += -dx * 0.5;
    state.animation.cameraOffset.y += -dy * 0.5;
    playInvalidMoveSound();
    state.animation.happinessTarget = 0.0;
    state.animation.isBlinking = true;
    state.animation.timeTillNextBlink = 150;
    return;
  }

  // if still here, make move
  player.x = targetX;
  player.y = targetY;

  playStepSound();

  state.undoStack.push(previousState);
  state.animation.lastDirection.x = dx;
  state.animation.lastDirection.y = dy;
  state.animation.happinessTarget = 0.5;

  // check if game solved
  const solved = state.level.dynamic.boxes.every((box) =>
    state.level.static.goals.some(
      (goal) => goal.x === box.x && goal.y === box.y,
    ),
  );
  if (solved) {
    state.animation.happinessTarget = 1.0;
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
