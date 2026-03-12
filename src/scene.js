// src/scene.js
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";

/**
 * Loads the golf course and calls onLoaded({ course, ballMesh }).
 * Assumes the Blender ball object is named: "Ball" (from `o Ball`).
 */
export function loadCourse(scene, onLoaded) {
  const mtlLoader = new MTLLoader();
  const objLoader = new OBJLoader();

  mtlLoader.load("/models/golf_course.mtl", (materials) => {
    materials.preload();
    objLoader.setMaterials(materials);

    objLoader.load("/models/golf_course.obj", (course) => {
      course.scale.set(1, 1, 1);
      course.position.set(0, 0, 0);
      course.rotation.y = Math.PI / 2;
      scene.add(course);

      // Find the ball mesh by name
      const ballMesh = course.getObjectByName("Ball");

      // Try to find a hole mesh (named "Hole" or any mesh with 'hole' in its name)
      let holeMesh = course.getObjectByName("Hole") || course.getObjectByName("hole");
      if (!holeMesh) {
        course.traverse((c) => {
          if (!holeMesh && c.isMesh && (c.name || "").toLowerCase().includes("hole")) {
            holeMesh = c;
          }
        });
      }

      // Prune the course: remove everything except the Ball and Hole meshes so the
      // scene only contains the ball and the hole (user requested).
      // Keep groups/parents necessary to preserve transforms for kept meshes.
      const keepSet = new Set();
      if (ballMesh) keepSet.add(ballMesh);
      if (holeMesh) keepSet.add(holeMesh);

      // If we found a hole mesh, shrink it so the hole is much smaller in the scene.
      if (holeMesh) {
        // scale down to 15% of original size (smaller hole)
        holeMesh.scale.multiplyScalar(0.15);
        // reduce cylinder depth (Y scale) to half to make the hole shallower
        holeMesh.scale.y *= 0.15;
        console.log("loadCourse: scaled hole mesh down to 15% size (", holeMesh.name, ")");
      }

      // Collect removable meshes
      const removable = [];
      course.traverse((c) => {
        if (c.isMesh && !keepSet.has(c)) {
          removable.push(c);
        }
      });

      removable.forEach((mesh) => {
        if (mesh.parent) mesh.parent.remove(mesh);
      });

      if (!holeMesh) {
        console.warn("loadCourse: couldn't find a hole mesh inside the OBJ; leaving course as-is.");
      }

      if (typeof onLoaded === "function") {
        onLoaded({ course, ballMesh, holeMesh });
      }
    });
  });
}

