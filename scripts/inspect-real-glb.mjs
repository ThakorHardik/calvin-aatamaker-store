/**
 * CALVIN AATAMAKER — Deep Inspection of Actual GLB Asset
 * Loads public/models/calvin-compact-01-prototype.glb via GLTFLoader
 */

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLB_PATH = path.join(process.cwd(), 'public', 'models', 'calvin-compact-01-prototype.glb');

if (!fs.existsSync(GLB_PATH)) {
  console.error(`ERROR: GLB not found at ${GLB_PATH}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(GLB_PATH);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

console.log('===============================================================');
console.log('       CALVIN AATAMAKER: REAL GLB DEEP ASSET AUDIT');
console.log('===============================================================');
console.log(`File Path:   ${GLB_PATH}`);
console.log(`File Size:   ${fileBuffer.byteLength} bytes (${(fileBuffer.byteLength / 1024).toFixed(2)} KB)`);

const loader = new GLTFLoader();

loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  console.log('\n--- 1. OVERALL BOUNDING DIMENSIONS ---');
  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  console.log(`Min: [X: ${bbox.min.x.toFixed(4)}, Y: ${bbox.min.y.toFixed(4)}, Z: ${bbox.min.z.toFixed(4)}] m`);
  console.log(`Max: [X: ${bbox.max.x.toFixed(4)}, Y: ${bbox.max.y.toFixed(4)}, Z: ${bbox.max.z.toFixed(4)}] m`);
  console.log(`Center: [X: ${center.x.toFixed(4)}, Y: ${center.y.toFixed(4)}, Z: ${center.z.toFixed(4)}] m`);
  console.log(`Calculated Dimensions (m):  ${size.x.toFixed(4)} (W) x ${size.z.toFixed(4)} (D) x ${size.y.toFixed(4)} (H)`);
  console.log(`Calculated Dimensions (mm): ${(size.x * 1000).toFixed(1)} mm (W) x ${(size.z * 1000).toFixed(1)} mm (D) x ${(size.y * 1000).toFixed(1)} mm (H)`);
  console.log(`Reported Approved Dimensions: 480.0 mm (W) x 340.0 mm (D) x 880.0 mm (H)`);

  const deltaW = Math.abs(size.x * 1000 - 480);
  const deltaD = Math.abs(size.z * 1000 - 340);
  const deltaH = Math.abs(size.y * 1000 - 880);
  console.log(`Dimension Variance: ΔW = ${deltaW.toFixed(1)} mm, ΔD = ${deltaD.toFixed(1)} mm, ΔH = ${deltaH.toFixed(1)} mm`);

  console.log('\n--- 2. OBJECT HIERARCHY & MESH BREAKDOWN ---');
  let meshCount = 0;
  let totalVertices = 0;
  let totalTriangles = 0;

  function printHierarchy(node, depth = 0) {
    const indent = '  '.repeat(depth);
    let details = `${node.name || '(unnamed)'} [${node.type}]`;

    if (node.isMesh) {
      meshCount++;
      const geo = node.geometry;
      const mat = node.material;
      const vertCount = geo.attributes.position ? geo.attributes.position.count : 0;
      const indexCount = geo.index ? geo.index.count / 3 : vertCount / 3;
      totalVertices += vertCount;
      totalTriangles += indexCount;

      details += ` (Verts: ${vertCount}, Tris: ${indexCount}, Mat: ${mat ? (Array.isArray(mat) ? mat.map(m => m.name).join(', ') : mat.name) : 'none'})`;
    }

    console.log(`${indent}├── ${details}`);
    if (node.children) {
      for (const child of node.children) {
        printHierarchy(child, depth + 1);
      }
    }
  }

  printHierarchy(scene);
  console.log(`\nTotal Meshes: ${meshCount}, Total Vertices: ${totalVertices}, Total Triangles: ${totalTriangles}`);

  console.log('\n--- 3. FRONT_PRINT_SURFACE DEEP INSPECTION ---');
  const printMesh = scene.getObjectByName('Front_Print_Surface');
  if (printMesh) {
    console.log(`Found Mesh: ${printMesh.name} (Type: ${printMesh.type})`);
    console.log(`Visible:    ${printMesh.visible}`);
    printMesh.updateMatrixWorld(true);
    const pBbox = new THREE.Box3().setFromObject(printMesh);
    const pSize = new THREE.Vector3();
    pBbox.getSize(pSize);
    console.log(`Print Surface Dimensions: ${(pSize.x * 1000).toFixed(1)} mm (W) x ${(pSize.y * 1000).toFixed(1)} mm (H) x ${(pSize.z * 1000).toFixed(2)} mm (D)`);
    console.log(`Print Surface World Center: X: ${((pBbox.min.x + pBbox.max.x) / 2).toFixed(3)}, Y: ${((pBbox.min.y + pBbox.max.y) / 2).toFixed(3)}, Z: ${((pBbox.min.z + pBbox.max.z) / 2).toFixed(3)} m`);

    // UV Coordinates inspection
    const geo = printMesh.geometry;
    const uvAttr = geo.attributes.uv;
    if (uvAttr) {
      console.log(`UV Attribute count: ${uvAttr.count}`);
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let i = 0; i < uvAttr.count; i++) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        uMin = Math.min(uMin, u);
        uMax = Math.max(uMax, u);
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
        console.log(`  UV vertex ${i}: (U=${u.toFixed(3)}, V=${v.toFixed(3)})`);
      }
      console.log(`UV Bounds: U in [${uMin}, ${uMax}], V in [${vMin}, ${vMax}]`);
    } else {
      console.log('WARNING: No UV attribute found on Front_Print_Surface!');
    }

    // Normal vectors inspection
    const normAttr = geo.attributes.normal;
    if (normAttr) {
      console.log(`Normal Vector (sample 0): [X: ${normAttr.getX(0).toFixed(2)}, Y: ${normAttr.getY(0).toFixed(2)}, Z: ${normAttr.getZ(0).toFixed(2)}]`);
      if (normAttr.getZ(0) > 0.9) {
        console.log(`Normal Orientation: Pointing FORWARD (+Z) towards user -> CORRECT`);
      } else {
        console.log(`WARNING: Normal vector unexpected orientation: ${normAttr.getZ(0)}`);
      }
    }

    // Material slot
    const mat = printMesh.material;
    console.log(`Material: Name="${mat.name}", Roughness=${mat.roughness}, Metalness=${mat.metalness}, Color=#${mat.color ? mat.color.getHexString() : 'N/A'}`);
  } else {
    console.error('ERROR: Front_Print_Surface mesh not found in GLB hierarchy!');
  }

  console.log('\n--- 4. CALVIN_FIXED_LOGO DEEP INSPECTION ---');
  const logoMesh = scene.getObjectByName('Calvin_Fixed_Logo');
  if (logoMesh) {
    console.log(`Found Logo Node: ${logoMesh.name} (Type: ${logoMesh.type})`);
    logoMesh.updateMatrixWorld(true);
    const lBbox = new THREE.Box3().setFromObject(logoMesh);
    const lSize = new THREE.Vector3();
    lBbox.getSize(lSize);
    console.log(`Logo Dimensions: ${(lSize.x * 1000).toFixed(1)} mm (W) x ${(lSize.y * 1000).toFixed(1)} mm (H)`);
    console.log(`Logo Position:   X=${((lBbox.min.x + lBbox.max.x) / 2).toFixed(3)} m, Y=${((lBbox.min.y + lBbox.max.y) / 2).toFixed(3)} m, Z=${((lBbox.min.z + lBbox.max.z) / 2).toFixed(3)} m`);
    console.log(`Logo Material:   Name="${logoMesh.material.name}", Map=${logoMesh.material.map ? 'Present' : 'None (Applied at runtime via TextureLoader)'}`);
    console.log(`Logo Z vs Print Surface Z: Logo Z=${lBbox.max.z.toFixed(4)} m, Print Surface Z=${(printMesh ? new THREE.Box3().setFromObject(printMesh).max.z.toFixed(4) : 'N/A')} m`);
  } else {
    console.error('ERROR: Calvin_Fixed_Logo node not found in GLB hierarchy!');
  }

  console.log('\n===============================================================');
  console.log('                  INSPECTION AUDIT COMPLETE');
  console.log('===============================================================');
}, (err) => {
  console.error('FATAL ERROR parsing GLB:', err);
  process.exit(1);
});

