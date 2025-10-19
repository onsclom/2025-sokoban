import { generateLevel, levelDimensions } from "./sokoban";
import stoneSpecs from "./generator/stone-specs.json";
import grassSpecs from "./generator/grass-specs.json";

import * as Camera from "./camera";
import * as Input from "./input";
import { playInvalidMoveSound, playSelectSound, playStepSound } from "./sound";

import { classicLevels } from "./levels/parse-levels";

// Cached textures for performance
let cachedGrassTexture: HTMLCanvasElement | null = null;
let cachedStoneTexture: HTMLCanvasElement | null = null;
const edgeRemover = 0.0025;

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
  winTransparency: 0,

  timeTillNextBlink: 3000 + Math.random() * 2000, // 3-5 seconds initially
  isBlinking: false,
};

const completedLevels = JSON.parse(
  localStorage.getItem("completedLevels") ?? "[]",
) as number[];
console.log(completedLevels);
function addCompletedLevel(index: number) {
  if (!completedLevels.includes(index)) {
    completedLevels.push(index);
  }
  localStorage.setItem("completedLevels", JSON.stringify(completedLevels));
}

const viewSource = document.querySelector("a");

const keyRepeatDelay = 250;
const keyRepeatInterval = 115;

const initState = {
  currentState: "level-select" as "level-select" | "in-level",
  levelSelect: {
    selectedX: 0,
    animatedX: 0,
    selectedY: 0,
    animatedY: 0,
  },

  level: structuredClone(classicLevels[0]!.level),
  undoStack: [] as ReturnType<typeof generateLevel>["dynamic"][],

  curClassicIndex: 0,

  animation: structuredClone(initAnimation),
  camera: Camera.create(),

  keyRepeat: {
    movement: {
      lastDir: { x: 0, y: 0 },
      timeHeld: 0,
      repeats: 0,
    },
    undo: {
      isHeld: false,
      timeHeld: 0,
      repeats: 0,
    },
  },

  pauseMenu: {
    selectedIndex: 0,
    options: ["restart level", "back to level select"] as const,
    isPaused: false,
  },
};

const state = structuredClone(initState);

function loadLevel() {
  state.level = structuredClone(classicLevels[state.curClassicIndex]!.level);
  state.animation = structuredClone(initAnimation); // reset animation
  // init animations

  state.animation.initialized = true;
  state.animation.player.x = state.level.dynamic.player.x;
  state.animation.player.y = state.level.dynamic.player.y;
  state.animation.boxes = state.level.dynamic.boxes.map((box) => ({
    x: box.x,
    y: box.y,
    tint: 0,
  }));

  state.undoStack = [];
}

function inLevelStuff(ctx: CanvasRenderingContext2D, dt: number) {
  const vh = ctx.canvas.getBoundingClientRect().height / 100;

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

  if (Input.keysJustPressed.has("Escape")) {
    state.pauseMenu.isPaused = !state.pauseMenu.isPaused;
    state.pauseMenu.selectedIndex = 0;
  }

  if (!state.pauseMenu.isPaused) {
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

    // Helper function for undo action
    const performUndo = () => {
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
    };

    if (Input.keysJustPressed.has("z") || Input.keysJustPressed.has("u")) {
      performUndo();
    }

    // Helper function to handle key repeat logic
    const handleKeyRepeat = (
      isHeld: boolean,
      repeatState: { timeHeld: number; repeats: number },
      action: () => void,
    ) => {
      if (isHeld) {
        repeatState.timeHeld += dt;
        if (repeatState.timeHeld >= keyRepeatDelay) {
          const oldRepeats = repeatState.repeats;
          const newRepeats = Math.floor(
            (repeatState.timeHeld - keyRepeatDelay) / keyRepeatInterval,
          );
          repeatState.repeats = newRepeats;
          if (oldRepeats !== repeatState.repeats) {
            action();
          }
        }
      } else {
        repeatState.timeHeld = 0;
        repeatState.repeats = 0;
      }
    };

    // Movement handling
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

    // Movement key repeat
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

    const isDirHeld = curDir.x !== 0 || curDir.y !== 0;
    const sameDirHeld =
      curDir.x === state.keyRepeat.movement.lastDir.x &&
      curDir.y === state.keyRepeat.movement.lastDir.y &&
      isDirHeld;

    if (sameDirHeld) {
      handleKeyRepeat(true, state.keyRepeat.movement, () =>
        attemptMovePlayer(curDir.x, curDir.y),
      );
    } else {
      state.keyRepeat.movement.lastDir = curDir;
      handleKeyRepeat(false, state.keyRepeat.movement, () => {});
    }

    // Undo key repeat
    const isUndoHeld = Input.keysDown.has("z") || Input.keysDown.has("u");
    const undoStateChanged = isUndoHeld !== state.keyRepeat.undo.isHeld;

    if (undoStateChanged && !isUndoHeld) {
      // Key was released, reset repeat state
      state.keyRepeat.undo.isHeld = false;
      handleKeyRepeat(false, state.keyRepeat.undo, () => {});
    } else if (isUndoHeld) {
      state.keyRepeat.undo.isHeld = true;
      handleKeyRepeat(true, state.keyRepeat.undo, performUndo);
    }

    if (Input.keysJustPressed.has("r")) {
      // restart level
      loadLevel();
    }

    // if (Input.keysJustPressed.has("g")) {
    //   // generate new level
    //   state.level = generateLevel({
    //     width: 5,
    //     height: 5,
    //     boxAmount: 1,
    //     generationMoves: 1,
    //   });
    //   state.animation = structuredClone(initAnimation); // reset animation
    //   state.undoStack = [];
    // }
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
  drawSokobanLevel(ctx);

  ctx.fillStyle = "black";
  const levelName = classicLevels[state.curClassicIndex]!.name;
  const fontSize = vh * 5;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "center";

  {
    // undo text
    ctx.globalAlpha = state.animation.undoTransparency;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = vh * 10;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#f22";
    ctx.fillText("UNDO", rect.width / 2, rect.height - fontSize);
    ctx.globalAlpha = 1;
  }

  {
    // you win text
    const allBoxesOnGoals = state.level.dynamic.boxes.every((box) =>
      state.level.static.goals.some(
        (goal) => goal.x === box.x && goal.y === box.y,
      ),
    );
    state.animation.winTransparency = lerp(
      state.animation.winTransparency,
      allBoxesOnGoals ? 1 : 0,
      1 - Math.exp(-animationSpeed * dt),
    );
    if (allBoxesOnGoals) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = state.animation.winTransparency;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.translate(rect.width / 2, rect.height / 2);
      const fontSize = vh * 10;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.rotate(-0.05 * Math.sin(performance.now() * 0.005));
      ctx.fillStyle = "black";
      ctx.fillText("YOU WIN!", 0 + 3, 0 + 3);
      ctx.fillStyle = "white";
      ctx.fillText("YOU WIN!", 0, 0);
      ctx.restore();

      const subFontSize = vh * 2.5;
      // at bottom of screen say "E for next level, R to restart"
      ctx.font = `${subFontSize}px sans-serif`;
      ctx.fillStyle = "black";
      ctx.fillText(
        "E for next level, R to restart",
        rect.width / 2 + 3,
        rect.height - subFontSize + 3,
      );
      ctx.fillStyle = "white";
      ctx.fillText(
        "E for next level, R to restart",
        rect.width / 2,
        rect.height - subFontSize,
      );
    }

    if (allBoxesOnGoals) {
      addCompletedLevel(state.curClassicIndex);
    }
  }

  ctx.font = `${fontSize}px sans-serif`;
  const levelCompleted = completedLevels.includes(state.curClassicIndex);
  ctx.fillStyle = "black";
  const offset = 3;
  ctx.fillText(`${levelName}`, rect.width / 2 + offset, fontSize + offset);
  ctx.fillStyle = levelCompleted ? "gold" : "white";
  ctx.fillText(`${levelName}`, rect.width / 2, fontSize);

  // PAUSE MENU JUICE
  if (state.pauseMenu.isPaused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const menuFontSize = 80;
    ctx.font = `${menuFontSize}px sans-serif`;

    // handle input here
    if (
      Input.keysJustPressed.has("ArrowUp") ||
      Input.keysJustPressed.has("w")
    ) {
      state.pauseMenu.selectedIndex -= 1;
      if (state.pauseMenu.selectedIndex < 0)
        state.pauseMenu.selectedIndex = state.pauseMenu.options.length - 1;
      playStepSound();
    }
    if (
      Input.keysJustPressed.has("ArrowDown") ||
      Input.keysJustPressed.has("s")
    ) {
      state.pauseMenu.selectedIndex += 1;
      if (state.pauseMenu.selectedIndex >= state.pauseMenu.options.length)
        state.pauseMenu.selectedIndex = 0;
      playStepSound();
    }

    if (Input.keysJustPressed.has("Enter") || Input.keysJustPressed.has(" ")) {
      const selectedOption =
        state.pauseMenu.options[state.pauseMenu.selectedIndex]!;
      switch (selectedOption) {
        case "restart level":
          loadLevel();
          state.pauseMenu.isPaused = false;
          break;
        case "back to level select":
          state.currentState = "level-select";
          state.pauseMenu.isPaused = false;
          break;
      }
      playSelectSound();
    }

    // draw options centered on screen
    for (let i = 0; i < state.pauseMenu.options.length; i++) {
      const option = state.pauseMenu.options[i]!;
      const textY =
        rect.height / 2 +
        (i - (state.pauseMenu.options.length - 1) / 2) * (menuFontSize + 20);
      if (i === state.pauseMenu.selectedIndex) {
        ctx.fillStyle = "yellow";
        ctx.fillText(`> ${option} <`, rect.width / 2, textY);
      } else {
        ctx.fillStyle = "white";
        ctx.fillText(option, rect.width / 2, textY);
      }
    }
  }
}

function drawSokobanLevel(ctx: CanvasRenderingContext2D, rect?: DOMRect) {
  const levelSize = levelDimensions(state.level);
  const canvasRect = rect || ctx.canvas.getBoundingClientRect();
  state.camera.zoom =
    Camera.aspectFitZoom(canvasRect, levelSize.width, levelSize.height) * 0.85;

  // draw sokoban
  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    ctx.translate(
      state.animation.cameraOffset.x,
      state.animation.cameraOffset.y,
    );

    // center level
    // by default at (0, 0)
    ctx.translate(-levelSize.width / 2, -levelSize.height / 2);
    // draw floor using cached texture
    for (const floor of state.level.static.floors) {
      if (cachedGrassTexture) {
        ctx.save();
        ctx.translate(floor.x - edgeRemover, floor.y - edgeRemover);
        ctx.scale(0.01, 0.01); // Scale down from 100px to 1 unit
        ctx.drawImage(
          cachedGrassTexture,
          0,
          0,
          100 + 2 * edgeRemover * 100,
          100 + 2 * edgeRemover * 100,
        );
        ctx.restore();
      } else {
        // Fallback to simple green if texture not loaded
        ctx.fillStyle = "green";
        const edgeRemover = 0.01;
        ctx.fillRect(
          floor.x - edgeRemover,
          floor.y - edgeRemover,
          1 + 2 * edgeRemover,
          1 + 2 * edgeRemover,
        );
      }
    }
    {
      const shadowOffset = 0.1;
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      for (const wall of state.level.static.walls) {
        ctx.fillRect(
          wall.x + shadowOffset - edgeRemover,
          wall.y + shadowOffset - edgeRemover,
          1 + 2 * edgeRemover,
          1 + 2 * edgeRemover,
        );
      }
      for (const box of state.animation.boxes) {
        ctx.fillRect(
          box.x + shadowOffset - edgeRemover,
          box.y + shadowOffset - edgeRemover,
          1 + 2 * edgeRemover,
          1 + 2 * edgeRemover,
        );
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
    // draw walls using cached texture
    for (const wall of state.level.static.walls) {
      if (cachedStoneTexture) {
        ctx.save();
        ctx.translate(wall.x - edgeRemover, wall.y - edgeRemover);
        ctx.scale(0.01, 0.01); // Scale down from 100px to 1 unit
        ctx.drawImage(
          cachedStoneTexture,
          0,
          0,
          100 + 2 * edgeRemover * 100,
          100 + 2 * edgeRemover * 100,
        );
        ctx.restore();
      } else {
        // Fallback to simple gray if texture not loaded
        ctx.fillStyle = "gray";
        ctx.fillRect(wall.x, wall.y, 1, 1);
      }
    }

    // draw goals
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 0.075;
    for (const goal of state.level.static.goals) {
      ctx.save();
      ctx.strokeStyle = "yellow";
      ctx.strokeRect(goal.x + 0.2, goal.y + 0.2, 0.6, 0.6);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "white";
      ctx.globalAlpha =
        Math.abs(
          Math.sin(performance.now() * 0.005 + (goal.x + goal.y) * 0.5),
        ) * 0.75;
      ctx.strokeRect(goal.x + 0.2, goal.y + 0.2, 0.6, 0.6);
      ctx.restore();
    }

    // draw boxes
    for (const box of state.animation.boxes) {
      // make a border and X for boxes
      ctx.fillStyle = "#674016";
      ctx.fillRect(box.x, box.y, 1, 1);
      {
        const BOX_BORDER_SIZE = 0.075;
        const BOX_X_INSET = BOX_BORDER_SIZE / 2;

        ctx.fillStyle = "#895129";
        ctx.fillRect(box.x + 0.1, box.y + 0.1, 0.8, 0.8);
        ctx.fillRect(
          box.x + BOX_BORDER_SIZE,
          box.y + BOX_BORDER_SIZE,
          1 - 2 * BOX_BORDER_SIZE,
          1 - 2 * BOX_BORDER_SIZE,
        );

        ctx.strokeStyle = "#674016";
        // draw X
        ctx.beginPath();
        ctx.moveTo(box.x + 0.05, box.y + 0.05);
        ctx.lineTo(box.x + 0.95, box.y + 0.95);
        ctx.moveTo(box.x + 0.95, box.y + 0.05);
        ctx.lineTo(box.x + 0.05, box.y + 0.95);
        ctx.lineWidth = 0.1;
        ctx.moveTo(box.x + BOX_X_INSET, box.y + BOX_X_INSET);
        ctx.lineTo(box.x + 1 - BOX_X_INSET, box.y + 1 - BOX_X_INSET);
        ctx.moveTo(box.x + 1 - BOX_X_INSET, box.y + BOX_X_INSET);
        ctx.lineTo(box.x + BOX_X_INSET, box.y + 1 - BOX_X_INSET);
        ctx.lineWidth = BOX_BORDER_SIZE;
        ctx.stroke();
      }

      // draw gold tint above box
      ctx.globalAlpha = box.tint * 0.25;
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
}

export function tick(ctx: CanvasRenderingContext2D, dt: number) {
  if (viewSource) {
    viewSource.style.visibility =
      state.currentState === "level-select" ? "visible" : "hidden";
  }

  // Initialize cached textures on first tick
  if (!cachedGrassTexture) {
    cachedGrassTexture = createGrassTexture();
  }
  if (!cachedStoneTexture) {
    cachedStoneTexture = createStoneTexture();
  }

  if (state.currentState === "in-level") {
    inLevelStuff(ctx, dt);
  } else if (state.currentState === "level-select") {
    const rect = ctx.canvas.getBoundingClientRect();
    // lets do vh units
    const vh = rect.height / 100;

    const levelsPerRow = 10;
    const levelAmount = classicLevels.length;
    const rowAmount = Math.ceil(levelAmount / levelsPerRow);

    // handle input
    if (
      Input.keysJustPressed.has("ArrowUp") ||
      Input.keysJustPressed.has("w")
    ) {
      state.levelSelect.selectedY -= 1;
      if (state.levelSelect.selectedY < 0) {
        state.levelSelect.selectedY = rowAmount - 1;
      }
      playStepSound();
    }
    if (
      Input.keysJustPressed.has("ArrowDown") ||
      Input.keysJustPressed.has("s")
    ) {
      state.levelSelect.selectedY += 1;
      if (state.levelSelect.selectedY >= rowAmount) {
        state.levelSelect.selectedY = 0;
      }
      playStepSound();
    }
    if (
      Input.keysJustPressed.has("ArrowLeft") ||
      Input.keysJustPressed.has("a")
    ) {
      state.levelSelect.selectedX -= 1;
      if (state.levelSelect.selectedX < 0) {
        state.levelSelect.selectedX = levelsPerRow - 1;
      }
      playStepSound();
    }
    if (
      Input.keysJustPressed.has("ArrowRight") ||
      Input.keysJustPressed.has("d")
    ) {
      state.levelSelect.selectedX += 1;
      if (state.levelSelect.selectedX >= levelsPerRow) {
        state.levelSelect.selectedX = 0;
      }
      playStepSound();
    }

    const levelButtonSize = vh * 8;

    const selectedIndex =
      state.levelSelect.selectedY * levelsPerRow + state.levelSelect.selectedX;

    state.curClassicIndex = selectedIndex;
    loadLevel();

    if (Input.keysJustPressed.has("Enter") || Input.keysJustPressed.has(" ")) {
      if (selectedIndex < classicLevels.length) {
        state.currentState = "in-level";
      }
      playSelectSound();
    }

    ctx.fillStyle = "#99f";
    ctx.fillRect(0, 0, rect.width, rect.height);

    {
      // for some reason adding offscreenCanvas as a child of body makes it render correctly ????
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = rect.width * devicePixelRatio;
      offscreenCanvas.height = rect.height * devicePixelRatio;
      document.body.appendChild(offscreenCanvas);
      const offscreenCtx = offscreenCanvas.getContext("2d")!;
      offscreenCtx.translate(-rect.width / 2, -rect.height / 2);
      drawSokobanLevel(offscreenCtx, rect);
      document.body.removeChild(offscreenCanvas);

      {
        ctx.save();
        ctx.filter = `blur(${vh}px)`;
        ctx.drawImage(offscreenCanvas, 0, 0, rect.width, rect.height);
        ctx.restore();
      }
    }

    // ctx.fillStyle = "black";
    // ctx.globalAlpha = 0.7;
    // ctx.fillRect(0, 0, rect.width, rect.height);
    // ctx.globalAlpha = 1;

    state.levelSelect.animatedX = lerp(
      state.levelSelect.animatedX,
      state.levelSelect.selectedX,
      1 - Math.exp(-animationSpeed * dt),
    );
    state.levelSelect.animatedY = lerp(
      state.levelSelect.animatedY,
      state.levelSelect.selectedY,
      1 - Math.exp(-animationSpeed * dt),
    );
    // draw the yellow circle here
    ctx.fillStyle = "rgba(0,255,255, 0.8)";
    ctx.beginPath();
    ctx.arc(
      rect.width / 2 -
        (levelsPerRow * levelButtonSize) / 2 +
        state.levelSelect.animatedX * levelButtonSize +
        levelButtonSize / 2,
      rect.height / 2 -
        (rowAmount * levelButtonSize) / 2 +
        state.levelSelect.animatedY * levelButtonSize +
        levelButtonSize / 2,
      levelButtonSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      rect.width / 2 -
        (levelsPerRow * levelButtonSize) / 2 +
        state.levelSelect.animatedX * levelButtonSize +
        levelButtonSize / 2,
      rect.height / 2 -
        (rowAmount * levelButtonSize) / 2 +
        state.levelSelect.animatedY * levelButtonSize +
        levelButtonSize / 2,
      levelButtonSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.stroke();

    // lets do 9 rows of 10 each?
    const shadowOffset = 0.4;
    for (let i = 0; i < levelAmount; i++) {
      const level = classicLevels[i]!;
      const row = Math.floor(i / levelsPerRow);
      const col = i % levelsPerRow;
      const x =
        rect.width / 2 -
        (levelsPerRow * levelButtonSize) / 2 +
        col * levelButtonSize;
      const y =
        rect.height / 2 -
        (rowAmount * levelButtonSize) / 2 +
        row * levelButtonSize;

      const selectedIndex =
        state.levelSelect.selectedY * levelsPerRow +
        state.levelSelect.selectedX;

      ctx.font = `${vh * 4}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "black";
      ctx.save();
      ctx.translate(
        x + levelButtonSize / 2,
        y +
          levelButtonSize / 2 +
          Math.sin(performance.now() * 0.003 + (x + y) * 0.1) * vh * 0.4,
      );
      ctx.fillStyle = "black";
      ctx.fillText(`${i + 1}`, vh * shadowOffset, vh * shadowOffset);

      const levelCompleted = completedLevels.includes(i);
      ctx.fillStyle = levelCompleted ? "gold" : "white";
      ctx.fillText(`${i + 1}`, 0, 0);
      ctx.restore();
    }

    // show "choose level" text at top middle
    const fontSize = vh * 10;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.save();
    ctx.translate(
      rect.width / 2,
      fontSize * 0.6 + Math.sin(performance.now() * 0.003) * vh * 0.1,
    );
    ctx.rotate(Math.sin(performance.now() * 0.002) * 0.03);

    ctx.fillStyle = "black";
    ctx.fillText("sokoban.xyz", 3, shadowOffset * vh);
    ctx.fillStyle = "white";
    ctx.fillText("sokoban.xyz", 0, 0);

    ctx.restore();

    // at bottom say "levels from original 1982 release"
    const subFontSize = vh * 3;
    ctx.font = `${subFontSize}px sans-serif`;
    // ctx.fillStyle = "black";
    // ctx.fillText(
    //   "Levels from original 1982 release",
    //   rect.width / 2 + 3,
    //   rect.height - subFontSize + 3,
    // );
    ctx.fillStyle = "white";
    ctx.fillText(
      "(levels taken from original 1982 release)",
      rect.width / 2,
      rect.height - subFontSize,
    );
  }

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

function createGrassTexture(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 100; // 100px will be scaled down to 1 unit
  canvas.height = 100;
  const ctx = canvas.getContext("2d")!;

  // Fill base green color
  ctx.fillStyle = "green";
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "#090";

  // Draw grass specs
  for (const spec of grassSpecs) {
    for (const y of [-1, 0, 1]) {
      for (const x of [-1, 0, 1]) {
        // each spec is a triangle which fits in the spec circle
        ctx.beginPath();
        const angle = (Math.PI * 2) / 3;
        ctx.moveTo(
          (spec.x + x) * 100 +
            spec.size * 100 * Math.cos(angle * 0 - Math.PI / 2),
          (spec.y + y) * 100 +
            spec.size * 100 * Math.sin(angle * 0 - Math.PI / 2),
        );
        ctx.lineTo(
          (spec.x + x) * 100 +
            spec.size * 100 * Math.cos(angle * 1 - Math.PI / 2),
          (spec.y + y) * 100 +
            spec.size * 100 * Math.sin(angle * 1 - Math.PI / 2),
        );
        ctx.lineTo(
          (spec.x + x) * 100 +
            spec.size * 100 * Math.cos(angle * 2 - Math.PI / 2),
          (spec.y + y) * 100 +
            spec.size * 100 * Math.sin(angle * 2 - Math.PI / 2),
        );
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  return canvas;
}

function createStoneTexture(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 100; // 100px will be scaled down to 1 unit
  canvas.height = 100;
  const ctx = canvas.getContext("2d")!;

  // Fill base gray color
  ctx.fillStyle = "gray";
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "darkgray";

  // Draw stone specs
  for (const spec of stoneSpecs) {
    for (const y of [-1, 0, 1]) {
      for (const x of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.ellipse(
          (spec.x + x) * 100,
          (spec.y + y) * 100,
          spec.size * 100,
          spec.size * 100,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }

  return canvas;
}
