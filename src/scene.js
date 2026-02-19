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

      if (typeof onLoaded === "function") {
        onLoaded({ course, ballMesh });
      }
    });
  });
}

