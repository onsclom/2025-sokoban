export const keysDown = new Set<string>();
export const keysJustPressed = new Set<string>();
export const keysJustReleased = new Set<string>();
export const mouse = {
  onCanvas: false,
  x: 0,
  y: 0,
  justLeftClicked: false,
  justRightClicked: false,
  leftClickDown: false,
  rightClickDown: false,
  wheelDx: 0,
  wheelDy: 0,
};
export const previousControllers = <Array<Gamepad | null>>[];

export function resetInput() {
  mouse.justLeftClicked = false;
  mouse.justRightClicked = false;
  mouse.wheelDx = 0;
  mouse.wheelDy = 0;
  keysJustPressed.clear();
  keysJustReleased.clear();

  // make deep copy of gamepads
  const gamepadClone = Array.from(navigator.getGamepads()).map((gp) => {
    if (!gp) return null;
    return {
      id: gp.id,
      index: gp.index,
      connected: gp.connected,
      mapping: gp.mapping,
      axes: gp.axes.slice(),
      buttons: gp.buttons.map((b) => ({
        pressed: b.pressed,
        value: b.value,
        touched: b.touched,
      })),
      timestamp: gp.timestamp,
      vibrationActuator: gp.vibrationActuator,
    } as Gamepad;
  });
  previousControllers.splice(0, previousControllers.length, ...gamepadClone);
}

export function registerInputListeners(canvas: HTMLCanvasElement) {
  document.body.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      if (e.pointerType === "touch") {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.leftClickDown = true;
        mouse.justLeftClicked = true;
        // capture the pointer to continue receiving events outside the canvas?
      } else if (e.button === 0) {
        mouse.leftClickDown = true;
        mouse.justLeftClicked = true;
      } else if (e.button === 2) {
        mouse.rightClickDown = true;
        mouse.justRightClicked = true;
      }
    },
    { passive: false },
  );

  document.body.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      mouse.leftClickDown = false;
    } else if (e.button === 0) {
      mouse.leftClickDown = false;
    } else if (e.button === 2) {
      mouse.rightClickDown = false;
    }
  });

  document.body.addEventListener(
    "pointermove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    },
    { passive: false },
  );

  document.body.addEventListener("pointerenter", () => {
    mouse.onCanvas = true;
  });

  document.body.addEventListener("pointerleave", () => {
    mouse.onCanvas = false;
  });

  document.body.addEventListener("wheel", (e) => {
    mouse.wheelDx += e.deltaX;
    mouse.wheelDy += e.deltaY;
  });

  document.body.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!keysDown.has(e.key)) {
      keysJustPressed.add(e.key);
    }
    keysDown.add(e.key);
  });

  document.body.addEventListener("keyup", (e) => {
    keysDown.delete(e.key);
    keysJustReleased.add(e.key);
  });

  // detect zooming
}
