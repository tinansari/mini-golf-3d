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

	// Collect stone meshes (any mesh whose name contains 'stone') so we can
	// detect collisions with them as well. Precompute a simple XZ-radius for
	// each stone (assumes stones are static in the course).
	const stones = [];
	// How much to shrink each stone's bounding box before computing the
	// collision radius. Positive value means the box is expanded; we pass a
	// negative value to shrink the box inward. Tune this to adjust how close
	// the ball must be before a stone collision registers.
	const STONE_SHRINK = 0.3; // increased shrink so collisions occur closer to the mesh
	// Helper to decide whether a mesh name should be treated as a stone.
	// We want to match common exporter naming like:
	// - "stone", "Stone"
	// - "stone_01", "stone-1", "Stone01"
	// - "stones"
	// but avoid matching names where 'stone' is embedded like 'keystone' or 'stonegrass'.
	function isStoneName(name) {
		if (!name) return false;
		const n = name.toLowerCase();
		if (n === "stone" || n === "stones") return true;
		if (n.startsWith("stone_") || n.startsWith("stone-")) return true;
		if (/^stone\d+/.test(n)) return true; // stone1, stone01
		// match stone as a separate token delimited by non-alphanumerics
		if (/(^|[^a-z0-9])stone([^a-z0-9]|$)/i.test(name)) return true;
		return false;
	}

	course.traverse((c) => {
		if (c.isMesh && isStoneName(c.name)) {
			const b = new THREE.Box3().setFromObject(c);
			// shrink the box slightly so collisions feel tighter around the
			// actual mesh, avoids overly-large radii from exporter padding.
			b.expandByScalar(-STONE_SHRINK);
			const center = new THREE.Vector3();
			b.getCenter(center);
			const size = new THREE.Vector3();
			b.getSize(size);
			const radius = Math.max(size.x, size.z) / 2;
			stones.push({ mesh: c, center, radius, _prevCollided: false });
		}
	});

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

					// Check stones for collisions as well
					let stoneCollided = false;
					let stoneEntered = false;
					let stoneMesh = null;
					for (const s of stones) {
						const d = ballCenter.distanceTo(s.center);
						const c = d <= s.radius + ballRadius - margin;
						const e = c && !s._prevCollided;
						if (e) {
							console.log("Collision detected: ball hit stone (", s.mesh.name, ") dist=", d.toFixed(3));
						}
						// update previous
						s._prevCollided = c;
						if (c) {
							stoneCollided = true;
							stoneMesh = s.mesh;
						}
						if (e) stoneEntered = true;
					}

					return { collided, entered, stoneCollided, stoneEntered, stoneMesh };
		},

		reset() {
			_prevCollided = false;
		},
	};
}

