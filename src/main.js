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

// --- Ball State ---
let ballMesh = null;

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
  });  

// --- Input System ---
const input = initInput({
  camera,
  domElement: renderer.domElement,
  controls,
  groundY: 0,
});

// --- Animation ---
const clock = new THREE.Clock();
const shotVel = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  if (ballMesh) {
    // Apply shot
    if (input.consumeShotVelocity(shotVel)) {
      if (ball.velocity.length() < 0.01) {
        ball.velocity.copy(shotVel);
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

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

