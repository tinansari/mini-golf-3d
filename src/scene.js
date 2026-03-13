// src/scene.js
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Loads the golf course and calls onLoaded({ course, ballMesh }).
 * Assumes the Blender ball object is named: "Ball" (from `o Ball`).
 */
export function loadCourse(scene, onLoaded) {
  const loader = new GLTFLoader();
  loader.load("/models/new_golf_course.glb", (gltf) => {
    const course = gltf.scene || gltf.scenes[0];
    course.scale.set(1, 1, 1);
    course.position.set(0, 0, 0);
    course.rotation.y = Math.PI / 2;
    scene.add(course);

  // Find the ball mesh by name (try common name variants produced by exporters)
  const ballMesh = course.getObjectByName("ball") || course.getObjectByName("Ball") || course.getObjectByName("BALL");

    // Try to find a hole mesh (named "Hole" or any mesh with 'hole' in its name)
    let holeMesh = course.getObjectByName("hole") || course.getObjectByName("Hole") || course.getObjectByName("HOLE");
    if (!holeMesh) {
      course.traverse((c) => {
        if (!holeMesh && c.isMesh && (c.name || "").toLowerCase().includes("hole")) {
          holeMesh = c;
        }
      });
    }

    // Keep the GLB exactly as authored in Blender. Do not modify transforms or
    // scale of the course or its child meshes so the layout matches the source.

    if (typeof onLoaded === "function") {
      onLoaded({ course, ballMesh, holeMesh });
    }
  });
}

