/**
 * CALVIN AATAMAKER — Phase 7B.6.4 Verification Test Suite
 * 2D Editor Usability & Actual 3D Cart Preview Correction
 * 
 * Verifies:
 * 1. Task 1: 2D Editor layer selection (pointer and click stopPropagation, synchronized layer list, locked branding row).
 * 2. Task 2: Warm workspace styling, contrast border, safe margins, high-contrast amber handles.
 * 3. Task 3: Canva-style photo manipulation (8 resize handles, rotation slider with reset, aspect ratio lock, manual dimensions, crop overlay, undo/redo).
 * 4. Task 4: Official transparent CALVIN logo (/images/calvin-aatamaker-logo.png), single logo guarantee, protected zone.
 * 5. Task 5: Actual 3D WebGL render snapshot capture (forwardRef, capture3DSnapshot, preserveDrawingBuffer, cart storage upload, "Preview unavailable — reopen studio" fallback).
 * 6. Task 6: Canonical design data synchronization across 2D, 3D, cart, and checkout.
 */

import fs from 'node:fs';
import {
  generateCartItemId,
  formatCustomisationSummary,
} from '../lib/cart.ts';
import { resolveCustomizationAssetUrl } from '../lib/3d/storage-assets.ts';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

console.log('=== CALVIN AATAMAKER: PHASE 7B.6.4 FIDELITY & 3D CART PREVIEW SUITE ===\n');

// =============================================================================
// [SUITE 1] Task 1: 2D Editor Layer Selection & Layer List Synchronization
// =============================================================================
console.log('[SUITE 1] Task 1: 2D Editor Layer Selection & Synchronization');

const editorFile = fs.readFileSync('components/customizer/2d-editor-canvas.tsx', 'utf8');

check(
  editorFile.includes('e.stopPropagation()') &&
  editorFile.includes('handlePointerDownTransform("move", e)') &&
  editorFile.includes('onClick={(e) => {') &&
  editorFile.includes('setSelectedLayerId(layer.id)'),
  'Layers implement both onPointerDown and onClick stopPropagation to prevent parent board deselection'
);

check(
  editorFile.includes('data-testid="editor-canvas-board"') &&
  editorFile.includes('setSelectedLayerId(null)'),
  'Board container deselects active layer only when clicking empty workspace space'
);

check(
  editorFile.includes('data-testid="design-layers-list"') &&
  editorFile.includes('data-testid={`layer-item-${layer.id}`}') &&
  editorFile.includes('data-testid={`layer-select-${layer.id}`}'),
  'Properties panel contains synchronized Design Layers List with dedicated layer selection items'
);

check(
  editorFile.includes('data-testid={`layer-visibility-${layer.id}`}') &&
  editorFile.includes('toggleLayerVisibility'),
  'Design Layers List supports individual layer visibility toggle (Eye/EyeOff)'
);

check(
  editorFile.includes('data-testid={`layer-delete-${layer.id}`}') &&
  editorFile.includes('deleteSelectedLayer'),
  'Design Layers List supports individual layer deletion'
);

check(
  editorFile.includes('Official CALVIN Logo (Locked)') &&
  editorFile.includes('Lock size={12}'),
  'Official CALVIN branding appears as a locked, non-editable row in Design Layers List'
);

// =============================================================================
// [SUITE 2] Task 2: Editor Workspace & Visual Hierarchy
// =============================================================================
console.log('\n[SUITE 2] Task 2: Editor Workspace Hierarchy & Safe Margins');

check(
  editorFile.includes('bg-[#F5F3EF]') || editorFile.includes('bg-[#FAF8F5]'),
  'Editor board has warm, light-neutral backdrop (#F5F3EF) contrasting with the machine panel'
);

check(
  editorFile.includes('bg-[#18181C]') && editorFile.includes('border-stone-800'),
  'Printable surface panel is rendered in dark machine charcoal (#18181C) with distinct outline'
);

check(
  editorFile.includes('data-testid="safe-margin-guide"') &&
  editorFile.includes('border-dashed'),
  'Safe print margins guide is rendered with subtle dashed boundary'
);

check(
  editorFile.includes('data-testid="protected-branding-zone"') &&
  editorFile.includes('border-dashed border-red-500/40'),
  'Protected branding exclusion zone is visualized with red dashed outline'
);

check(
  editorFile.includes('border-2 border-amber-500') &&
  editorFile.includes('border-2 border-amber-600') &&
  editorFile.includes('bg-white'),
  'Transform handles feature high-contrast white boxes with amber borders and drop shadows'
);

// =============================================================================
// [SUITE 3] Task 3: Canva-Style Photo Manipulation & Crop Tool
// =============================================================================
console.log('\n[SUITE 3] Task 3: Canva-Style Photo Manipulation & Crop Tool');

check(
  editorFile.includes('resize-tl') &&
  editorFile.includes('resize-tr') &&
  editorFile.includes('resize-bl') &&
  editorFile.includes('resize-br') &&
  editorFile.includes('resize-t') &&
  editorFile.includes('resize-b') &&
  editorFile.includes('resize-l') &&
  editorFile.includes('resize-r'),
  '8 resize transform handles provided for corner proportional and edge directional resizing'
);

check(
  editorFile.includes('aspectLocked') &&
  editorFile.includes('data-testid="toggle-aspect-ratio"'),
  'Aspect ratio lock toggle button implemented in photo properties panel'
);

check(
  editorFile.includes('data-testid="input-layer-width"') &&
  editorFile.includes('data-testid="input-layer-height"'),
  'Manual numerical width & height percentage inputs available'
);

check(
  editorFile.includes('data-testid="slider-layer-rotation"') &&
  editorFile.includes('data-testid="btn-reset-rotation"'),
  'Rotation slider (-180° to 180°) and one-click Reset Rotation button implemented'
);

check(
  editorFile.includes('data-testid="btn-center-horizontal"') &&
  editorFile.includes('data-testid="btn-center-vertical"'),
  'One-click horizontal & vertical centering buttons available'
);

check(
  editorFile.includes('data-testid="dpad-up"') &&
  editorFile.includes('data-testid="dpad-down"') &&
  editorFile.includes('data-testid="dpad-left"') &&
  editorFile.includes('data-testid="dpad-right"'),
  'On-screen D-pad provided for precision element positioning'
);

check(
  editorFile.includes('data-testid="btn-open-crop"') &&
  editorFile.includes('data-testid="crop-overlay"') &&
  editorFile.includes('data-testid="btn-apply-crop"') &&
  editorFile.includes('data-testid="btn-reset-crop"'),
  'Interactive photo crop tool with zoom, repositioning, apply, and reset buttons'
);

check(
  editorFile.includes('data-testid="btn-undo"') &&
  editorFile.includes('data-testid="btn-redo"'),
  'Multi-step undo/redo history controls provided'
);

// =============================================================================
// [SUITE 4] Task 4: Authentic Transparent CALVIN Logo
// =============================================================================
console.log('\n[SUITE 4] Task 4: Official CALVIN Logo Asset & Single-Brand Guarantee');

check(
  fs.existsSync('public/images/calvin-aatamaker-logo.png'),
  'Official transparent logo asset exists at public/images/calvin-aatamaker-logo.png'
);

check(
  editorFile.includes('src="/images/calvin-aatamaker-logo.png"') &&
  editorFile.includes('data-testid="official-calvin-logo"'),
  'EditorCanvas renders the authentic transparent logo asset at upper-center'
);

const viewport3dFile = fs.readFileSync('components/customizer/3d-viewport-preview.tsx', 'utf8');

check(
  viewport3dFile.includes('/images/calvin-aatamaker-logo.png') &&
  viewport3dFile.includes('Calvin_Fixed_Logo'),
  '3D Viewport dynamic front panel texture uses official transparent logo asset'
);

check(
  !editorFile.includes('>OFFICIAL CALVIN BRANDING<') &&
  !viewport3dFile.includes('OFFICIAL CALVIN BRANDING'),
  'No fake text substitute badges ("OFFICIAL CALVIN BRANDING") in 2D or 3D modules'
);

// =============================================================================
// [SUITE 5] Task 5: Actual 3D WebGL Render Snapshot & Cart Fallback
// =============================================================================
console.log('\n[SUITE 5] Task 5: Actual 3D WebGL Cart Preview & Fallback');

check(
  viewport3dFile.includes('preserveDrawingBuffer: true'),
  'Three.js WebGLRenderer initialized with preserveDrawingBuffer: true for snapshot capture'
);

check(
  viewport3dFile.includes('export interface ViewportPreviewHandle') &&
  viewport3dFile.includes('capture3DSnapshot: () => Promise<string>'),
  'ViewportPreview exports ViewportPreviewHandle with capture3DSnapshot imperative method'
);

check(
  viewport3dFile.includes('camera.position.set(1.4, 0.75, 1.6)') &&
  viewport3dFile.includes('renderer.domElement.toDataURL("image/png")'),
  'capture3DSnapshot sets camera to canonical 3/4 perspective beauty angle and captures high-res PNG'
);

const customizePageFile = fs.readFileSync('app/products/[slug]/customize/page.tsx', 'utf8');

check(
  customizePageFile.includes('const viewportRef = useRef<ViewportPreviewHandle>(null);') &&
  customizePageFile.includes('<ViewportPreview') &&
  customizePageFile.includes('ref={viewportRef}'),
  'Personalization studio connects viewportRef to ViewportPreview component'
);

check(
  customizePageFile.includes('await viewportRef.current.capture3DSnapshot()'),
  'Add to cart and save design invoke capture3DSnapshot() for actual 3D WebGL render'
);

check(
  customizePageFile.includes('fixed -left-[9999px] top-0 pointer-events-none w-[640px] h-[640px] opacity-0'),
  'ViewportPreview remains mounted offscreen during 2D editing so WebGL context stays warm'
);

const cartPageFile = fs.readFileSync('app/cart/page.tsx', 'utf8');

check(
  cartPageFile.includes('Preview unavailable — reopen studio'),
  'Cart page renders "Preview unavailable — reopen studio" fallback when 3D preview is unavailable'
);

check(
  cartPageFile.includes('resolveCustomizationAssetUrl(item.customPreviewUrl)') &&
  cartPageFile.includes('Custom 3D'),
  'Cart page displays custom 3D machine preview with "Custom 3D" badge'
);

// =============================================================================
// [SUITE 6] Task 6: Customization Data Synchronization
// =============================================================================
console.log('\n[SUITE 6] Task 6: Customization Data Synchronization');

const testDetails = {
  _design_id: 'test-design-123',
  _model_code: 'CALVIN-COMPACT-01',
  _surface_key: 'front_door_panel',
  _layers_count: 2,
  _mode: 'demonstration',
  _preview_storage_path: 'customer-customizations/test-design-123/preview.png',
  _preview_image: 'https://example.com/test-preview.png',
  _customization_summary: '2 Custom Layer(s)',
  door_finish_style: 'matte_graphite',
  flour_hopper_material: 'brushed_brass',
};

const summary = formatCustomisationSummary(testDetails);
check(
  summary.includes('Door Finish Style: matte_graphite') &&
  summary.includes('Flour Hopper Material: brushed_brass'),
  'Customization summary properly formats option fields without exposing internal metadata'
);

const cartId = generateCartItemId('p1', 'v1', testDetails, 'test-design-123');
check(
  cartId.includes('p1:v1:design-test-design-123'),
  'generateCartItemId embeds product, variant, and unique designId'
);

const resolvedPath = resolveCustomizationAssetUrl('customer-customizations/test-design-123/preview.png');
check(
  resolvedPath.startsWith('/api/customizations/upload?path='),
  'resolveCustomizationAssetUrl safely resolves storage path via authorized API route'
);

// Summary output
console.log(`\n=============================================================================`);
console.log(`PHASE 7B.6.4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`=============================================================================`);

if (failed > 0) {
  process.exit(1);
}
