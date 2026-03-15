import * as THREE from "three";

// Creates a collision detector for the hole inside the given course object.
export function createCollisionDetector(course) {
	if (!course) {
		return { check: () => false, reset: () => {} };
	}

	let hole = course.getObjectByName("Hole") || course.getObjectByName("hole") || course.getObjectByName("HOLE");

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

	// Collect stone meshes (any mesh whose name contains 'stone') 
	const stones = [];
	const STONE_SHRINK = 0.3; // increased shrink so collisions occur closer to the mesh
	
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
			b.expandByScalar(-STONE_SHRINK);
			const center = new THREE.Vector3();
			b.getCenter(center);
			const size = new THREE.Vector3();
			b.getSize(size);
			const radius = Math.max(size.x, size.z) / 2;
			stones.push({ mesh: c, center, radius, _prevCollided: false });
		}
	});

	if (stones.length > 0) {
		console.log("Stones found:");
		stones.forEach((s, i) => {
			s.index = i + 1;
			console.log(`${i + 1}: ${s.mesh.name}`);
		});
	}

	// Track previous collision state so we log every time the ball enters
	// the hole (transition from not-collided to collided)
	let _prevCollided = false;
	const stoneTmpBox = new THREE.Box3();
	const stoneTmpSize = new THREE.Vector3();

	return {
		
		 // Check whether the provided ball mesh is currently colliding with the hole.
		 // Returns true when collision is detected. 
			check(ballMesh) {
				if (!ballMesh) return { collided: false, entered: false };

			const ballBox = new THREE.Box3().setFromObject(ballMesh);
			const ballCenter = new THREE.Vector3();
			ballBox.getCenter(ballCenter);
			const ballSize = new THREE.Vector3();
			ballBox.getSize(ballSize);
			const ballRadius = Math.max(ballSize.x, ballSize.z) / 2;

			const dist = ballCenter.distanceTo(holeCenter);

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
			let stoneIndex = null;
			for (const s of stones) {
				if (!s.mesh.visible) {
					s._prevCollided = false;
					continue;
				}
				stoneTmpBox.setFromObject(s.mesh);
				stoneTmpBox.expandByScalar(-STONE_SHRINK);
				stoneTmpBox.getCenter(s.center);
				stoneTmpBox.getSize(stoneTmpSize);
				const stoneRadius = Math.max(stoneTmpSize.x, stoneTmpSize.z) / 2;
				const d = ballCenter.distanceTo(s.center);
				const c = d <= stoneRadius + ballRadius - margin;
				const e = c && !s._prevCollided;
				if (e) {
					console.log("Collision detected: ball hit stone (", s.mesh.name, ") dist=", d.toFixed(3));
				}
				// update previous
				s._prevCollided = c;
				if (c) {
					stoneCollided = true;
					stoneMesh = s.mesh;
					stoneIndex = s.index || null;
				}
				if (e) stoneEntered = true;
			}

			return { collided, entered, stoneCollided, stoneEntered, stoneMesh, stoneIndex };
		},

		reset() {
			_prevCollided = false;
		},
	};
}

