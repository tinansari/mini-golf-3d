import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { initInput } from "./input.js";
import { loadCourse } from "./scene.js";
import { createCollisionDetector } from "./collision.js";

// --- Scene Setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
// Move camera slightly closer to the ball while keeping the same viewing angle
camera.position.set(0, 1.5, 2.2);
camera.lookAt(0, 0, 0);

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

    // create collision detector for this course
    collisionDetector = createCollisionDetector(course);

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
const aimLineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
const aimLine = new THREE.Line(aimLineGeom, aimLineMat);
aimLine.visible = false;
scene.add(aimLine);

// --- Animation ---
const clock = new THREE.Clock();
const shotVel = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

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
    if (dragVis.length() > MAX_AIM_LEN) {
      dragVis.setLength(MAX_AIM_LEN);
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
          console.log("Ball collided with stone:", res.stoneMesh.name);
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
              // Stop and hide the ball, then show a small DOM alert above its screen
              ball.velocity.set(0, 0, 0);

              // compute screen pos of ball before hiding
              const screenPos = ballMesh.position.clone();
              screenPos.project(camera);
              const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
              const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

              // hide the mesh
              ballMesh.visible = false;

              // remove existing alert if any
              const existing = document.getElementById("win-alert");
              if (existing) existing.remove();

              const div = document.createElement("div");
              div.id = "win-alert";
              // show strokes and a hint to restart
              div.innerHTML = `You won in ${strokes} strokes!<br><span style="font-size:0.9em;opacity:0.95">Press R to play again.</span>`;
              Object.assign(div.style, {
                position: "absolute",
                left: `${Math.round(x)}px`,
                top: `${Math.max(10, Math.round(y - 30))}px`, // place above the ball
                transform: "translate(-50%, -100%)",
                background: "rgba(0,0,0,0.8)",
                color: "#fff",
                padding: "8px 12px",
                borderRadius: "6px",
                fontFamily: "sans-serif",
                zIndex: 1000,
              });
              document.body.appendChild(div);

              // auto-remove after 4 seconds
              setTimeout(() => {
                div.remove();
              }, 4000);
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
        ballMesh.position.copy(startPosition);
        ball.velocity.set(0, 0, 0);
        strokes = 0;
        // restore visibility and remove any win alert
        ballMesh.visible = true;
        const existing = document.getElementById("win-alert");
        if (existing) existing.remove();
        console.log("Reset. Strokes:", strokes);
      }
    }
  });  

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

