import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { initInput } from "./input.js";
import { loadCourse } from "./scene.js";

// --- Scene Setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = false; // no changing angle for now

// --- Lighting ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

let startPosition = new THREE.Vector3();

// --- Ball State ---
let ballMesh = null;

let strokes = 0;

const ball = {
  velocity: new THREE.Vector3(0, 0, 0),
};

// --- Load Course + Extract Blender Ball ---
loadCourse(scene, ({ course, ballMesh: loadedBall }) => {
    ballMesh = loadedBall;
  
    if (!ballMesh) {
      console.warn("Ball mesh named 'Ball' was not found in the OBJ.");
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

    startPosition.copy(ballMesh.position);

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

