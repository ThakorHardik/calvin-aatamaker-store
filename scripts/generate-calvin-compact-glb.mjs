/**
 * CALVIN AATAMAKER — 3D Prototype GLB Generator
 * 
 * Generates the official CALVIN-COMPACT-01 prototype 3D model adhering to:
 * - Approved overall dimensions: 480mm (W) x 340mm (D) x 880mm (H)
 * - Exact object hierarchy:
 *   CALVIN_Compact_Root
 *     ├── Cabinet_Body
 *     ├── Left_Side_Panel
 *     ├── Right_Side_Panel
 *     ├── Top_Panel
 *     ├── Bottom_Base
 *     ├── Front_Door_Frame
 *     ├── Front_Print_Surface (Separate printable surface with UV unwrap)
 *     ├── Front_Handle
 *     ├── Ventilation_Grille
 *     ├── Rear_Panel
 *     ├── Wheels
 *     └── Calvin_Fixed_Logo (Upper-front position, official branding)
 * - PBR Metallic-Roughness materials
 * - Standard glTF binary format (.glb)
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

// Node.js FileReader polyfill for GLTFExporter
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buf).toString('base64');
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
  };
}

console.log('=== GENERATING CALVIN-COMPACT-01 3D PROTOTYPE GLB ===');

// 1. Scene & Root Object
const scene = new THREE.Scene();
scene.name = 'Scene';

const root = new THREE.Group();
root.name = 'CALVIN_Compact_Root';
scene.add(root);

// PBR Material Palette
const matCabinetDark = new THREE.MeshStandardMaterial({
  name: 'mat_cabinet_body',
  color: new THREE.Color('#1A1A1E'), // Matte dark charcoal powder coat
  roughness: 0.45,
  metalness: 0.15,
});

const matSidePanel = new THREE.MeshStandardMaterial({
  name: 'mat_side_panel',
  color: new THREE.Color('#151518'),
  roughness: 0.50,
  metalness: 0.10,
});

const matBase = new THREE.MeshStandardMaterial({
  name: 'mat_bottom_base',
  color: new THREE.Color('#111113'),
  roughness: 0.60,
  metalness: 0.20,
});

const matChrome = new THREE.MeshStandardMaterial({
  name: 'mat_chrome_accents',
  color: new THREE.Color('#E2E8F0'),
  roughness: 0.15,
  metalness: 0.85,
});

const matFrontPrint = new THREE.MeshStandardMaterial({
  name: 'mat_front_print',
  color: new THREE.Color('#18181C'), // Neutral dark background for printable panel
  roughness: 0.35,
  metalness: 0.05,
});

const matLogoBadge = new THREE.MeshStandardMaterial({
  name: 'mat_calvin_fixed_logo',
  color: new THREE.Color('#FFFFFF'),
  roughness: 0.20,
  metalness: 0.10,
});

const matRubber = new THREE.MeshStandardMaterial({
  name: 'mat_rubber_wheels',
  color: new THREE.Color('#0A0A0C'),
  roughness: 0.80,
  metalness: 0.05,
});

// 2. Bottom_Base (Cast base pedestal)
// Dimensions: 460mm x 320mm x 40mm, Y: 0.035 to 0.075
const baseGeo = new THREE.BoxGeometry(0.460, 0.040, 0.320);
const bottomBase = new THREE.Mesh(baseGeo, matBase);
bottomBase.name = 'Bottom_Base';
bottomBase.position.set(0, 0.055, 0);
root.add(bottomBase);

// 3. Wheels (4 industrial caster wheels)
const wheelsGroup = new THREE.Group();
wheelsGroup.name = 'Wheels';
const wheelPositions = [
  [-0.190, 0.018, 0.120],
  [0.190, 0.018, 0.120],
  [-0.190, 0.018, -0.120],
  [0.190, 0.018, -0.120],
];

wheelPositions.forEach(([wx, wy, wz], i) => {
  const wheelCyl = new THREE.CylinderGeometry(0.018, 0.018, 0.014, 16);
  wheelCyl.rotateZ(Math.PI / 2);
  const wheelMesh = new THREE.Mesh(wheelCyl, matRubber);
  wheelMesh.position.set(wx, wy, wz);
  wheelMesh.name = `Wheel_${i + 1}`;
  wheelsGroup.add(wheelMesh);

  // Wheel caster bracket
  const bracketGeo = new THREE.BoxGeometry(0.020, 0.018, 0.024);
  const bracketMesh = new THREE.Mesh(bracketGeo, matChrome);
  bracketMesh.position.set(wx, wy + 0.015, wz);
  wheelsGroup.add(bracketMesh);
});
root.add(wheelsGroup);

// 4. Cabinet_Body (Main structural housing)
// Width: 476mm, Depth: 336mm, Height: 760mm, Y: 0.075 to 0.835 (Center: 0.455)
const bodyGeo = new THREE.BoxGeometry(0.476, 0.760, 0.336);
const cabinetBody = new THREE.Mesh(bodyGeo, matCabinetDark);
cabinetBody.name = 'Cabinet_Body';
cabinetBody.position.set(0, 0.455, 0);
root.add(cabinetBody);

// 5. Left_Side_Panel (Recessed side sheet)
const leftPanelGeo = new THREE.BoxGeometry(0.004, 0.730, 0.310);
const leftSidePanel = new THREE.Mesh(leftPanelGeo, matSidePanel);
leftSidePanel.name = 'Left_Side_Panel';
leftSidePanel.position.set(-0.239, 0.455, 0);
root.add(leftSidePanel);

// 6. Right_Side_Panel (Recessed side sheet)
const rightPanelGeo = new THREE.BoxGeometry(0.004, 0.730, 0.310);
const rightSidePanel = new THREE.Mesh(rightPanelGeo, matSidePanel);
rightSidePanel.name = 'Right_Side_Panel';
rightSidePanel.position.set(0.239, 0.455, 0);
root.add(rightSidePanel);

// 7. Rear_Panel (Service access back)
const rearPanelGeo = new THREE.BoxGeometry(0.460, 0.730, 0.004);
const rearPanel = new THREE.Mesh(rearPanelGeo, matCabinetDark);
rearPanel.name = 'Rear_Panel';
rearPanel.position.set(0, 0.455, -0.169);
root.add(rearPanel);

// 8. Top_Panel (Cabinet top cap + Hopper inlet)
// Width: 480mm, Depth: 340mm, Height: 45mm, Y: 0.835 to 0.880
const topGroup = new THREE.Group();
topGroup.name = 'Top_Panel';

const topCapGeo = new THREE.BoxGeometry(0.480, 0.045, 0.340);
const topCap = new THREE.Mesh(topCapGeo, matCabinetDark);
topCap.position.set(0, 0.8575, 0);
topGroup.add(topCap);

// Stainless Hopper Funnel Ring on top
const hopperRingGeo = new THREE.TorusGeometry(0.085, 0.010, 16, 32);
hopperRingGeo.rotateX(Math.PI / 2);
const hopperRing = new THREE.Mesh(hopperRingGeo, matChrome);
hopperRing.position.set(0, 0.880, -0.020);
topGroup.add(hopperRing);

const hopperLidGeo = new THREE.CylinderGeometry(0.080, 0.075, 0.015, 32);
const hopperLid = new THREE.Mesh(hopperLidGeo, matCabinetDark);
hopperLid.position.set(0, 0.882, -0.020);
topGroup.add(hopperLid);

root.add(topGroup);

// 9. Front_Door_Frame (Border surrounding the printable front panel)
const doorFrameGeo = new THREE.BoxGeometry(0.450, 0.710, 0.012);
const frontDoorFrame = new THREE.Mesh(doorFrameGeo, matCabinetDark);
frontDoorFrame.name = 'Front_Door_Frame';
frontDoorFrame.position.set(0, 0.465, 0.165);
root.add(frontDoorFrame);

// 10. Front_Print_Surface (The separate, customizable surface)
// Width: 380mm (0.380m), Height: 620mm (0.620m), Z: 0.172m (Front-most surface)
const printPlaneGeo = new THREE.PlaneGeometry(0.380, 0.620, 1, 1);

// Ensure dedicated planar UV unwrap: (0,0) at top-left, (1,1) at bottom-right
// PlaneGeometry default UVs: (0,0) bottom-left, (1,1) top-right
// Remap UVs so U=0 is Left, U=1 is Right, V=0 is Top, V=1 is Bottom
const uvs = printPlaneGeo.attributes.uv;
uvs.setXY(0, 0.0, 0.0); // top-left
uvs.setXY(1, 1.0, 0.0); // top-right
uvs.setXY(2, 0.0, 1.0); // bottom-left
uvs.setXY(3, 1.0, 1.0); // bottom-right
uvs.needsUpdate = true;

const frontPrintSurface = new THREE.Mesh(printPlaneGeo, matFrontPrint);
frontPrintSurface.name = 'Front_Print_Surface';
frontPrintSurface.position.set(0, 0.465, 0.172);
root.add(frontPrintSurface);

// 11. Front_Handle (Ergonomic brushed metal vertical handle on right edge)
const handleGroup = new THREE.Group();
handleGroup.name = 'Front_Handle';
const handleBarGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.140, 16);
const handleBar = new THREE.Mesh(handleBarGeo, matChrome);
handleBar.position.set(0.205, 0.470, 0.185);
handleGroup.add(handleBar);

// Handle upper and lower standoffs
const standoffTop = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.015), matChrome);
standoffTop.position.set(0.205, 0.535, 0.177);
handleGroup.add(standoffTop);

const standoffBottom = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.015), matChrome);
standoffBottom.position.set(0.205, 0.405, 0.177);
handleGroup.add(standoffBottom);
root.add(handleGroup);

// 12. Ventilation_Grille (Horizontal cooling slots near bottom of front panel)
const ventGroup = new THREE.Group();
ventGroup.name = 'Ventilation_Grille';
for (let v = 0; v < 4; v++) {
  const slitGeo = new THREE.BoxGeometry(0.220, 0.005, 0.003);
  const slitMesh = new THREE.Mesh(slitGeo, matCabinetDark);
  slitMesh.position.set(0, 0.125 + v * 0.010, 0.170);
  ventGroup.add(slitMesh);
}
root.add(ventGroup);

// 13. Calvin_Fixed_Logo (The ONLY company logo, fixed at upper-front position)
// Width: 120mm (0.120m), Height: 52.3mm (0.0523m) matching 2048x893 aspect ratio
// Position: X: 0, Y: 0.735m (Upper center of door), Z: 0.173m
const logoPlaneGeo = new THREE.PlaneGeometry(0.120, 0.0523);
const logoMesh = new THREE.Mesh(logoPlaneGeo, matLogoBadge);
logoMesh.name = 'Calvin_Fixed_Logo';
logoMesh.position.set(0, 0.735, 0.173);
root.add(logoMesh);

// Export to GLB
async function exportModel() {
  const modelsDir = path.join(process.cwd(), 'public', 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const outputPath = path.join(modelsDir, 'calvin-compact-01-prototype.glb');

  const exporter = new GLTFExporter();
  const glbBuffer = await exporter.parseAsync(scene, {
    binary: true,
    embedImages: false,
  });

  fs.writeFileSync(outputPath, Buffer.from(glbBuffer));
  console.log(`[SUCCESS] Prototype GLB written: ${outputPath} (${(glbBuffer.byteLength / 1024).toFixed(1)} KB)`);

  // Verify object hierarchy in exported model
  const rootObj = scene.getObjectByName('CALVIN_Compact_Root');
  console.log('\n--- VERIFIED OBJECT HIERARCHY ---');
  console.log(`Root: ${rootObj.name}`);
  rootObj.children.forEach((c) => {
    console.log(`  ├── ${c.name} (${c.type})`);
  });
}

exportModel().catch((err) => {
  console.error('[ERROR] GLB generation failed:', err);
  process.exit(1);
});

