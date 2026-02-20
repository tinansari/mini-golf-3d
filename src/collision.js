import * as THREE from "three";

/**
 * Creates a collision detector for the hole inside the given `course` object.
 *
 * Usage:
 *   const detector = createCollisionDetector(course);
 *   // every frame:
 *   if (detector.check(ballMesh)) { // collision detected (logged once) }
 *
 * The detector will attempt to find an object named "Hole" (case-insensitive)
 * inside `course`. It computes a simple XZ-radius from the hole's bounding box
 * and compares the ball's center to that radius. This is a lightweight
 * approximation suitable for our mini-golf demo.
 */
export function createCollisionDetector(course) {
	if (!course) {
		console.warn("createCollisionDetector: course is falsy");
		return { check: () => false, reset: () => {} };
	}

	// Try common name variants first
	let hole = course.getObjectByName("Hole") || course.getObjectByName("hole") || course.getObjectByName("HOLE");

	// Otherwise search for any mesh whose name contains 'hole'
	if (!hole) {
		course.traverse((c) => {
			if (!hole && c.isMesh && (c.name || "").toLowerCase().includes("hole")) {
				hole = c;
			}
		});
	}

	if (!hole) {
		console.warn("createCollisionDetector: couldn't find a hole mesh inside course");
		return { check: () => false, reset: () => {} };
	}

	// Compute hole center and radius (use XZ plane)
	const holeBox = new THREE.Box3().setFromObject(hole);
	const holeCenter = new THREE.Vector3();
	holeBox.getCenter(holeCenter);
	const holeSize = new THREE.Vector3();
	holeBox.getSize(holeSize);
	const holeRadius = Math.max(holeSize.x, holeSize.z) / 2;

	// Track previous collision state so we log every time the ball *enters*
	// the hole (transition from not-collided -> collided). This avoids
	// spamming logs each frame while the ball remains overlapping the hole,
	// but still logs every separate collision event.
	let _prevCollided = false;

	return {
		/**
		 * Check whether the provided ball mesh is currently colliding with the hole.
		 * Returns true when collision is detected. Logs an entry message each time
		 * the ball transitions from non-colliding to colliding (i.e. each entrance).
		 */
			check(ballMesh) {
				if (!ballMesh) return { collided: false, entered: false };

			const ballBox = new THREE.Box3().setFromObject(ballMesh);
			const ballCenter = new THREE.Vector3();
			ballBox.getCenter(ballCenter);
			const ballSize = new THREE.Vector3();
			ballBox.getSize(ballSize);
			const ballRadius = Math.max(ballSize.x, ballSize.z) / 2;

			const dist = ballCenter.distanceTo(holeCenter);

			// A small margin to account for pivots/mesh origin differences
			const margin = 0.01;

			// Overlap-based collision (ball and hole treated as circles in XZ plane)
					const collided = dist <= holeRadius + ballRadius - margin;

					const entered = collided && !_prevCollided;
					if (entered) {
						console.log(
							"Collision detected: ball entered hole (dist=",
							dist.toFixed(3),
							", holeRadius=",
							holeRadius.toFixed(3),
							", ballRadius=",
							ballRadius.toFixed(3),
							")"
						);
					}

					// Update previous state so future entrances are detected again
					_prevCollided = collided;

					return { collided, entered };
		},

		reset() {
			_prevCollided = false;
		},
	};
}

