import * as THREE from "three";

export function initInput({ camera, domElement, controls, groundY = 0 }) {
  // Aaim/shot state 
  let isAiming = false;
  let startPoint = new THREE.Vector3();   // point on ground where drag started
  let currPoint = new THREE.Vector3();    // current point on ground during drag

  // Shot output
  let shotRequested = false;
  let shotVelocity = new THREE.Vector3();

  const MAX_DRAG = 2.5;      // Clamp drag length
  const POWER_SCALE = 21.0;   // Initial speed

  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

  function setFallbackAimPoint(outVec3) {
    if (controls?.target) {
      outVec3.copy(controls.target);
      outVec3.y = groundY;
      return;
    }

    outVec3.set(0, groundY, 0);
  }

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

  // OrbitControls behavior
  if (controls) {
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
  }

  function onPointerDown(e) {
    // Allow OrbitControls to handle dragging
    if (e.metaKey || e.altKey || e.button === 1 || e.button === 2) {
      if (controls) controls.enabled = true;
      isAiming = false;
      return;
    }

    // Aiming mode: disable controls so primary-button drag does not pan or rotate
    if (controls) controls.enabled = false;

    const ok = getGroundPointFromEvent(e, startPoint);
    if (!ok) {
      setFallbackAimPoint(startPoint);
    }

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
    const drag = new THREE.Vector3().subVectors(startPoint, currPoint);

    // Only use XZ plane for shot direction
    drag.y = 0;

    const dragLen = drag.length();
    if (dragLen < 0.05) return; // small drag, ignore shot

    // Clamp drag length
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
    get isAiming() {
      return isAiming;
    },
    get startPoint() {
      return startPoint;
    },
    get currPoint() {
      return currPoint;
    },

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