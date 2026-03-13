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

    // Reduce the hole cylinder height along the Z axis so the hole appears
    // shallower in the scene. Some GLB exports orient cylinder height along
    // the Z axis for this model, so we scale Z by 50%. This only runs if we
    // found a hole mesh.
    if (holeMesh && holeMesh.scale) {
      // halve the Z scale (depth/height)
      holeMesh.scale.y *= 0.25;
      console.log("loadCourse: reduced hole mesh Z-scale by 50%:", holeMesh.name);
    }

    // Keep the GLB otherwise as authored in Blender. We only tweak the hole
    // depth above so the gameplay hole is shallower.

    if (typeof onLoaded === "function") {
      onLoaded({ course, ballMesh, holeMesh });
    }
  });
}

