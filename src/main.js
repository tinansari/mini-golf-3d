import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { initInput } from "./input.js";

// --- basic setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Person B requirement: don't allow changing angle for now
controls.enableRotate = false;

// --- input (Person B) ---
const input = initInput({
  camera,
  domElement: renderer.domElement,
  controls,
  groundY: 0, // keep 0 while your floor is at y=0
});

// --- light ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// --- simple ground (temporary) ---
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a8f2a });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

// --- ball (temporary) ---
const ballRadius = 0.2;

const ballGeo = new THREE.SphereGeometry(ballRadius, 24, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
const ballMesh = new THREE.Mesh(ballGeo, ballMat);
ballMesh.position.set(0, ballRadius, 0); // sits on ground
scene.add(ballMesh);

const ball = {
  radius: ballRadius,
  mesh: ballMesh,
  velocity: new THREE.Vector3(0, 0, 0),
};

// --- animation ---
const clock = new THREE.Clock();
const shotVel = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  // Apply shot on mouse release (only if ball is basically stopped)
  if (input.consumeShotVelocity(shotVel)) {
    if (ball.velocity.length() < 0.01) {
      ball.velocity.copy(shotVel);
    }
  }

  // Temporary movement (Person C will replace with physics.js later)
  const dt = clock.getDelta();
  
    // Move ball
    ball.mesh.position.addScaledVector(ball.velocity, dt);

    // Friction (gradual velocity decay)
    const k = 2.0; // friction strength (bigger = stops faster)
    ball.velocity.multiplyScalar(Math.max(0, 1 - k * dt));

    // Stop threshold
    if (ball.velocity.length() < 0.05) {
    ball.velocity.set(0, 0, 0);
    }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// --- resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
