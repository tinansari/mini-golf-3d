import * as THREE from "three";

export function initInput({ camera, domElement, controls, groundY = 0 }) {
  // --- aim/shot state ---
  let isAiming = false;
  let startPoint = new THREE.Vector3();   // point on ground where drag started
  let currPoint = new THREE.Vector3();    // current point on ground during drag

  // shot output (set on mouseup)
  let shotRequested = false;
  let shotVelocity = new THREE.Vector3();

  // --- tunables ---
  const MAX_DRAG = 2.5;      // world units; clamp drag length
  const POWER_SCALE = 21.0;   // maps drag length -> initial speed

  // --- helpers ---
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

  function getGroundPointFromEvent(e, outVec3) {
    const rect = domElement.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    raycaster.setFromCamera(mouseNDC, camera);
    // intersect ray with y = groundY plane
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(groundPlane, hit);
    if (!ok) return false;

    outVec3.copy(hit);
    return true;
  }

  // --- OrbitControls behavior ---
  // No angle changing: disable rotate always.
  if (controls) {
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
  }

  // --- events ---
  function onPointerDown(e) {
    // Cmd+drag = pan; let OrbitControls handle it
    if (e.metaKey) {
      if (controls) controls.enabled = true;
      isAiming = false;
      return;
    }

    // aiming mode: disable controls so drag doesn't pan/rotate
    if (controls) controls.enabled = false;

    const ok = getGroundPointFromEvent(e, startPoint);
    if (!ok) return;

    isAiming = true;
    currPoint.copy(startPoint);
  }

  function onPointerMove(e) {
    if (!isAiming) return;
    getGroundPointFromEvent(e, currPoint);
  }

  function onPointerUp(e) {
    if (!isAiming) return;
    isAiming = false;

    // Re-enable controls after aiming ends
    if (controls) controls.enabled = true;

    // Drag vector: start - current (pull back), so shot goes toward (start - curr)
    // This matches: drag left/back -> shoots right/forward (opposite direction).
    const drag = new THREE.Vector3().subVectors(startPoint, currPoint);

    // Only use XZ plane for shot direction
    drag.y = 0;

    const dragLen = drag.length();
    if (dragLen < 0.05) return; // tiny drag = no shot

    // Clamp drag length so force doesn't go crazy
    const clampedLen = Math.min(dragLen, MAX_DRAG);

    // Direction
    const dir = drag.normalize();

    // Speed proportional to clamped length
    const speed = dragLen * POWER_SCALE;

    shotVelocity.copy(dir).multiplyScalar(speed);
    shotRequested = true;
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  return {
    // If you want to draw an aim line later, these are useful:
    get isAiming() {
      return isAiming;
    },
    get startPoint() {
      return startPoint;
    },
    get currPoint() {
      return currPoint;
    },

    // Main integration hook:
    consumeShotVelocity(outVec3) {
      if (!shotRequested) return false;
      outVec3.copy(shotVelocity);
      shotRequested = false;
      return true;
    },

    dispose() {
      domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    },
  };
}