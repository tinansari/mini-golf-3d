import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { initInput } from "./input.js";
import { loadCourse } from "./scene.js";
import { createCollisionDetector } from "./collision.js";

// --- Scene Setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
// Move camera slightly closer to the ball while keeping the same viewing angle
camera.position.set(0, 9.5, 8.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Allow panning so the user can move the camera around the authored scene
// Keep rotate disabled for now so the view angle doesn't change unexpectedly
controls.enableRotate = false; // no changing angle for now
controls.enablePan = true;
// Use screen-space panning so vertical drag pans up/down the screen instead of dollying
controls.screenSpacePanning = true;
// Map primary (left) mouse drag to panning so the user can pan with the primary button
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};

// --- Lighting ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// add a hemisphere light for nicer sky/ground lighting
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.35));
scene.add(new THREE.AmbientLight(0xffffff, 0.22));

// Load an EXR environment (equirectangular). Put your EXR at `public/assets/your_env.exr`
new RGBELoader().load("/textures/horn-koppe_spring_4k.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;

  scene.background = texture;

  // rotate the HDR environment
  scene.backgroundRotation.y = Math.PI / 2;
});

let startPosition = new THREE.Vector3();

// --- Ball State ---
let ballMesh = null;
const BALL_RADIUS = 0.12;

let strokes = 0;
let currentLevel = 0;

const LEVEL_CONTROLLED_STONE_NAMES = new Set([
  "stone_2_edit_stone_2_edit_0001",
  "stone_2_edit_stone_2_edit_0",
  "stone_2_edit_stone_2_edit_0002",
]);
const LEVEL_3_HIDDEN_STONE_NAMES = new Set([
  "stone_2_edit_stone_2_edit_0",
  "stone_2_edit_stone_2_edit_0002",
]);
const LEVEL_3_MOVING_STONE_NAME = "stone_2_edit_stone_2_edit_0001";
const LEVEL_3_MOVING_STONE_AMPLITUDE = 20.0;
const LEVEL_3_MOVING_STONE_SPEED = 2.0;
const LEVEL_3_MOVING_STONE_HEIGHT_OFFSET = -12.0;

const levelControlledStones = [];
let levelThreeMovingStone = null;
let levelThreeMovingStoneBasePosition = null;
let levelThreeMovingDirection = new THREE.Vector3();

function updateLevelStoneVisibility() {
  for (const stone of levelControlledStones) {
    if (currentLevel === 2) {
      stone.visible = true;
    } else if (currentLevel === 3) {
      stone.visible = !LEVEL_3_HIDDEN_STONE_NAMES.has(stone.name);
    } else {
      stone.visible = false;
    }
  }

  if (currentLevel !== 3 && levelThreeMovingStone && levelThreeMovingStoneBasePosition) {
    levelThreeMovingStone.position.copy(levelThreeMovingStoneBasePosition);
  }

  console.log("[level3-debug] visibility update", {
    currentLevel,
    controlledStoneCount: levelControlledStones.length,
    movingStoneFound: !!levelThreeMovingStone,
    hasBasePosition: !!levelThreeMovingStoneBasePosition,
    movingStoneVisible: levelThreeMovingStone ? levelThreeMovingStone.visible : null,
  });
}

function animateLevelThreeStone(elapsedSeconds) {
  if (
    currentLevel !== 3 ||
    !levelThreeMovingStone ||
    !levelThreeMovingStoneBasePosition
  ) {
    return;
  }

  const offset =
    Math.sin(elapsedSeconds * LEVEL_3_MOVING_STONE_SPEED) *
    LEVEL_3_MOVING_STONE_AMPLITUDE;

  levelThreeMovingStone.position.copy(levelThreeMovingStoneBasePosition);
  levelThreeMovingStone.position.addScaledVector(levelThreeMovingDirection, offset);
  // raise stone slightly so it doesn't clip into grass
  levelThreeMovingStone.position.z += LEVEL_3_MOVING_STONE_HEIGHT_OFFSET;
}

function removeWinAlert() {
  const existing = document.getElementById("win-alert");
  if (existing) existing.remove();
}

function showLevelCompleteAlert(completedLevel) {
  removeWinAlert();

  const isFinalLevel = completedLevel >= 3;

  const container = document.createElement("div");
  container.id = "win-alert";
  Object.assign(container.style, {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(0,0,0,0.85)",
    color: "#fff",
    padding: "16px 20px",
    borderRadius: "8px",
    fontFamily: "sans-serif",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    alignItems: "center",
  });

  const message = document.createElement("div");
  message.textContent = isFinalLevel
    ? "Level 3 complete. Press R to play again."
    : `You completed level ${completedLevel}.`;

  container.appendChild(message);

  if (!isFinalLevel) {
    const nextRoundButton = document.createElement("button");
    nextRoundButton.textContent = "Next round";
    Object.assign(nextRoundButton.style, {
      border: "none",
      borderRadius: "6px",
      padding: "8px 12px",
      cursor: "pointer",
    });

    nextRoundButton.addEventListener("click", () => {
      const nextLevel = Math.min(completedLevel + 1, 3);
      console.log("[level3-debug] next round clicked", {
        completedLevel,
        nextLevel,
      });
      currentLevel = nextLevel;
      updateLevelStoneVisibility();
      console.log("Current level:", currentLevel);
      container.remove();
    });

    container.appendChild(nextRoundButton);
  }

  document.body.appendChild(container);
}

const ball = {
  velocity: new THREE.Vector3(0, 0, 0),
};

// Resolve a collision between the ball and a static stone. Uses a simple
// restitution + tangential damping model to reflect the velocity based on
// the collision normal. Also nudges the ball slightly outside the stone to
// avoid sticking.
function resolveStoneCollision(ballMeshLocal, ballState, collisionNormal) {
  const n = collisionNormal.clone().normalize();

  // only respond if ball is moving into the surface
  const vn = ballState.velocity.dot(n);
  if (vn >= 0) return;

  // push ball slightly outside obstacle to avoid sticking
  ballMeshLocal.position.add(n.clone().multiplyScalar(0.02));

  const restitution = 0.65;     // bounce strength
  const tangentDamping = 0.92;  // friction-like loss along the surface

  const vNormal = n.clone().multiplyScalar(vn);
  const vTangent = ballState.velocity.clone().sub(vNormal);

  ballState.velocity.copy(
    vTangent.multiplyScalar(tangentDamping)
      .sub(vNormal.multiplyScalar(restitution))
  );
}

let collisionDetector = null;

let lastBallPos = new THREE.Vector3();

function respawnBallAtLevelOneStart() {
  if (!ballMesh) return;

  const cameraOffset = camera.position.clone().sub(ballMesh.position);

  ball.velocity.set(0, 0, 0);
  ballMesh.position.copy(startPosition);
  ballMesh.visible = true;

  camera.position.copy(startPosition).add(cameraOffset);
  lastBallPos.copy(startPosition);
  controls.target.copy(startPosition);
  controls.update();
}

// --- Load Course + Extract Blender Ball ---
loadCourse(scene, ({ course, ballMesh: loadedBall, holeMesh }) => {
    ballMesh = loadedBall;
  
    if (!ballMesh) {
      console.warn("Ball mesh named 'ball' (or variant) was not found in the GLB.");
      return;
    }
  
    // IMPORTANT: detach ball from rotated course so it moves in world space
    course.updateMatrixWorld(true);
  
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
  
    ballMesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);
  
    course.remove(ballMesh);
    scene.add(ballMesh);
  
    ballMesh.position.copy(worldPos);
    ballMesh.quaternion.copy(worldQuat);
    ballMesh.scale.copy(worldScale);

    // Keep the ball exactly as authored in the GLB. We detach it from the course
    // so it can be moved independently, but do not change its local scale, geometry
    // or position beyond applying the world transform from the GLB.

    startPosition.copy(ballMesh.position);
    lastBallPos.copy(ballMesh.position);

    camera.lookAt(startPosition);
    controls.target.copy(startPosition);
    controls.update();

    // create collision detector for this course
    collisionDetector = createCollisionDetector(course);

    levelControlledStones.length = 0;
    levelThreeMovingStone = null;
    levelThreeMovingStoneBasePosition = null;
    levelThreeMovingDirection.set(0, 0, 0);
    course.traverse((c) => {
      if (c.isMesh && LEVEL_CONTROLLED_STONE_NAMES.has(c.name)) {
        levelControlledStones.push(c);
        console.log("[level3-debug] found controlled stone", c.name);
        if (c.name === LEVEL_3_MOVING_STONE_NAME) {
          levelThreeMovingStone = c;
          levelThreeMovingStoneBasePosition = c.position.clone();

          const worldQuat = c.getWorldQuaternion(new THREE.Quaternion());

          // Blender Y axis -> transformed into world direction
          levelThreeMovingDirection.set(0, 1, 0).applyQuaternion(worldQuat);
          levelThreeMovingDirection.y = 0; // keep motion on ground plane only
          levelThreeMovingDirection.normalize();

          console.log("[level3-debug] found moving stone", {
            name: c.name,
            basePosition: levelThreeMovingStoneBasePosition.toArray(),
            moveDir: levelThreeMovingDirection.toArray(),
          });
        }
      }
    });
    if (!levelThreeMovingStone) {
      console.warn("[level3-debug] moving stone not found", LEVEL_3_MOVING_STONE_NAME);
    }
    updateLevelStoneVisibility();

  });  

// --- Input System ---
const input = initInput({
  camera,
  domElement: renderer.domElement,
  controls,
  groundY: 0,
});

// --- Aim Line (visual feedback while dragging) ---
const aimLinePoints = [new THREE.Vector3(), new THREE.Vector3()];
const aimLineGeom = new THREE.BufferGeometry().setFromPoints(aimLinePoints);
const aimLineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  depthTest: false,
});
const aimLine = new THREE.Line(aimLineGeom, aimLineMat);
const lastAimDirection = new THREE.Vector3(1, 0, 0);
aimLine.visible = false;
aimLine.renderOrder = 1000;
aimLine.frustumCulled = false;
scene.add(aimLine);

// --- Animation ---
const clock = new THREE.Clock();
const shotVel = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  animateLevelThreeStone(clock.getElapsedTime());

// --- Aim Line (top-center of ball mesh, visual clamp only) ---
if (ballMesh && input.isAiming) {
    // True top-center of the mesh (handles weird pivots)
    const box = new THREE.Box3().setFromObject(ballMesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const start = new THREE.Vector3(center.x, box.max.y, center.z);
  
    // Raw drag (unlimited power in input.js)
    const dragRaw = new THREE.Vector3().subVectors(input.startPoint, input.currPoint);
    dragRaw.y = 0;
  
    // Clamp ONLY the visual line length
    const dragVis = dragRaw.clone();
    const MAX_AIM_LEN = 2.5;
    const MIN_AIM_LEN = 0.2;
    if (dragVis.length() > MAX_AIM_LEN) {
      dragVis.setLength(MAX_AIM_LEN);
    }

    if (dragVis.lengthSq() > 1e-6) {
      lastAimDirection.copy(dragVis).normalize();
      if (dragVis.length() < MIN_AIM_LEN) {
        dragVis.setLength(MIN_AIM_LEN);
      }
    } else {
      dragVis.copy(lastAimDirection).setLength(MIN_AIM_LEN);
    }
  
    const VIS_SCALE = 1.5;
  
    aimLinePoints[0].copy(start);
    aimLinePoints[1].copy(start).addScaledVector(dragVis, VIS_SCALE);
  
    aimLine.geometry.setFromPoints(aimLinePoints);
    aimLine.visible = true;
  } else {
    aimLine.visible = false;
  }       

  if (ballMesh) {
    // Apply shot
    if (input.consumeShotVelocity(shotVel)) {
        if (ball.velocity.length() < 0.01) {
          ball.velocity.copy(shotVel);
          strokes += 1;
          console.log("Strokes:", strokes);
        }
      }

    // Move ball
    ballMesh.position.addScaledVector(ball.velocity, dt);

    // Move camera with the ball
    const delta = ballMesh.position.clone().sub(lastBallPos);
    camera.position.add(delta);
    lastBallPos.copy(ballMesh.position);

    // Keep camera centered on the ball
    controls.target.copy(ballMesh.position);

    // No visual scaling: keep the ball's scale as authored in the GLB so the
    // scene layout matches Blender exactly.

    // Rotate ball based on movement so it rolls
    const moveDist = ball.velocity.length() * dt;
    const axis = new THREE.Vector3(ball.velocity.z, 0, -ball.velocity.x).normalize();
    ballMesh.rotateOnWorldAxis(axis, moveDist / BALL_RADIUS);

      // Check collision with hole (check returns { collided, entered })
      if (collisionDetector) {
        const res = collisionDetector.check(ballMesh);

        // If the ball collided with any stone, resolve collision with a
        // reflection response so the ball bounces/deflects instead of
        // instantly stopping.
        if (res.stoneCollided && res.stoneMesh) {
          // approximate collision normal from stone center -> ball position
          const stoneBox = new THREE.Box3().setFromObject(res.stoneMesh);
          const stoneCenter = new THREE.Vector3();
          stoneBox.getCenter(stoneCenter);

          const normal = ballMesh.position.clone().sub(stoneCenter);
          normal.y = 0; // operate in XZ plane for surface normal
          if (normal.lengthSq() === 0) normal.set(0, 0, 1);
          normal.normalize();

          resolveStoneCollision(ballMesh, ball, normal);
          if (res.stoneIndex) {
            console.log(`Ball collided with stone #${res.stoneIndex}:`, res.stoneMesh.name);
          } else {
            console.log("Ball collided with stone:", res.stoneMesh.name);
          }
        }

        if (res.entered) {
            // Log the ball velocity (vector and scalar speed)
            const speed = ball.velocity.length();
            console.log(
              "Ball velocity on collision:",
              ball.velocity.clone(),
              "speed=",
              speed.toFixed(3)
            );

            // Only count as a win if speed <= 35
            if (speed <= 35) {
              const completedLevel = currentLevel >= 1 ? currentLevel : 1;
              currentLevel = completedLevel;
              updateLevelStoneVisibility();
              console.log("Current level:", currentLevel);

              respawnBallAtLevelOneStart();
              showLevelCompleteAlert(completedLevel);
            } else {
              console.log("Collision ignored: speed > 35 (", speed.toFixed(3), ")");
            }
        }
      }

    // Friction
    const k = 2.0;
    ball.velocity.multiplyScalar(Math.max(0, 1 - k * dt));

    // Stop threshold
    if (ball.velocity.length() < 0.05) {
      ball.velocity.set(0, 0, 0);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      if (ballMesh) {
        respawnBallAtLevelOneStart();
        strokes = 0;
        currentLevel = 0;
        updateLevelStoneVisibility();
        removeWinAlert();
        console.log("Reset. Strokes:", strokes, "Current level:", currentLevel);
      }
    }
  });  

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

