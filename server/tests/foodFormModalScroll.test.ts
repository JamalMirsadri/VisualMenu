import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * FoodFormModal Viewport & Scrolling Architecture Test Suite
 * 
 * Verifies:
 * 1. 3-tier structure: Fixed Header, Scrollable Content, Fixed Footer
 * 2. 100dvh Viewport constraint & safe margins
 * 3. Scrollable content: flex-1, overflow-y-auto, min-h-0, overscroll-contain
 * 4. Pinned header with close button always accessible
 * 5. Pinned footer with Cancel & Save always accessible via form="food-form"
 * 6. Background page scroll locking (overflow: hidden) and restoration
 * 7. Keyboard accessibility (Escape key handler)
 * 8. createPortal mounting directly to document.body
 * 9. Elimination of flexbox centering scroll cutoff trap
 * 10. Responsive media preview constraints (no nested scroll traps)
 * 11. Support for all food fields from top to bottom
 * 12. Optional media architecture preserved (image/video optionality)
 */

async function runFoodModalScrollTests() {
  console.log('📱 Starting FoodFormModal Viewport & Scrolling Architecture Test Suite (12 Tests)...\n');
  let passed = 0;
  let failed = 0;

  function assert(testNum: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${testNum}/12] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${testNum}/12] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const foodFormModalFile = path.join(rootDir, 'src/components/admin/FoodFormModal.tsx');
  const code = fs.readFileSync(foodFormModalFile, 'utf-8');

  // TEST 1: Three-Tier Layout Architecture
  assert(1, '3-tier modal architecture: Fixed Header, Scrollable Content, Fixed Footer', () => {
    // Header must have shrink-0
    if (!code.includes('shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b')) {
      throw new Error('Missing fixed header with shrink-0 and top border');
    }
    // Form body must have flex-1, overflow-y-auto, min-h-0
    if (!code.includes('flex-1 overflow-y-auto min-h-0 overscroll-contain')) {
      throw new Error('Missing scrollable body with flex-1 overflow-y-auto min-h-0 overscroll-contain');
    }
    // Footer must have shrink-0
    if (!code.includes('shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-t')) {
      throw new Error('Missing fixed footer with shrink-0 and bottom border');
    }
  });

  // TEST 2: Viewport Constraint with 100dvh
  assert(2, 'Viewport constraint: constrained to 100dvh with responsive margins', () => {
    if (!code.includes('max-h-[calc(100dvh-1.5rem)]') || !code.includes('overscroll-contain overflow-hidden')) {
      throw new Error('Modal container missing 100dvh max-height or overflow-hidden boundary');
    }
  });

  // TEST 3: Outer Overlay Elimination of Flexbox Scroll Cutoff Trap
  assert(3, 'Overlay architecture: outer backdrop uses overflow-hidden to prevent flexbox centering scroll cutoff', () => {
    // Outer overlay must NOT have overflow-y-auto (which caused negative coordinate scroll trap in flexbox)
    if (!code.includes('fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-hidden')) {
      throw new Error('Backdrop overlay must use overflow-hidden to avoid flexbox center scroll cutoff');
    }
  });

  // TEST 4: Pinned Header Accessibility
  assert(4, 'Pinned Header: Title and Close button remain visible and accessible at all times', () => {
    if (!code.includes('h2 id="food-modal-title"') || !code.includes('aria-label="Close dialog"')) {
      throw new Error('Header missing accessible title or close button');
    }
    if (!code.includes('<X className="w-5 h-5" />')) {
      throw new Error('Close button missing X icon');
    }
  });

  // TEST 5: Pinned Footer Accessibility & Native Form Connection
  assert(5, 'Pinned Footer: Save & Cancel buttons always reachable without scrolling, linked via form="food-form"', () => {
    if (!code.includes('form="food-form"')) {
      throw new Error('Submit button missing form="food-form" link to outer form container');
    }
    if (!code.includes('Save Food Item') || !code.includes('Cancel')) {
      throw new Error('Footer missing Save or Cancel button');
    }
  });

  // TEST 6: Background Page Scroll Locking
  assert(6, 'Body scroll lock: locks document.body.style.overflow="hidden" when open and restores on close', () => {
    if (!code.includes("document.body.style.overflow = 'hidden'")) {
      throw new Error('Missing document.body.style.overflow="hidden" lock');
    }
    if (!code.includes('document.body.style.overflow = prevBodyOverflow')) {
      throw new Error('Missing body overflow cleanup on unmount/close');
    }
  });

  // TEST 7: Keyboard Escape Listener
  assert(7, 'Keyboard navigation: Escape key listener closes modal smoothly', () => {
    if (!code.includes("if (e.key === 'Escape')") || !code.includes('onClose()')) {
      throw new Error('Missing Escape keydown handler');
    }
    if (!code.includes("window.removeEventListener('keydown', handleKeyDown)")) {
      throw new Error('Missing keydown event listener cleanup');
    }
  });

  // TEST 8: React Portal Mounting
  assert(8, 'Portal isolation: modal mounts into document.body via createPortal to prevent parent clipping', () => {
    if (!code.includes("import { createPortal } from 'react-dom'")) {
      throw new Error('Missing createPortal import from react-dom');
    }
    if (!code.includes('createPortal(modalContent, document.body)')) {
      throw new Error('Modal content must be rendered into document.body using createPortal');
    }
  });

  // TEST 9: Mobile Touch Scrolling & Safe Area Support
  assert(9, 'Touch scrolling: WebkitOverflowScrolling touch and overscroll-contain enabled', () => {
    if (!code.includes("WebkitOverflowScrolling: 'touch'")) {
      throw new Error('Missing WebkitOverflowScrolling: touch for smooth iOS scrolling');
    }
    if (!code.includes('overscroll-contain')) {
      throw new Error('Missing overscroll-contain on form container');
    }
  });

  // TEST 10: Media Section Viewport Protection
  assert(10, 'Media preview sizing: video preview is bounded (max-h-48) with no nested scroll traps', () => {
    if (!code.includes('aspect-video w-full max-h-48 rounded-lg overflow-hidden bg-black border border-zinc-800')) {
      throw new Error('Video preview container missing max-h-48 constraint');
    }
  });

  // TEST 11: Comprehensive Field Accessibility (Top to Bottom)
  assert(11, 'Form completeness: All fields present in scrollable body (Name, Price, Category, Allergens, Calories, Toggles)', () => {
    const requiredFieldMarkers = [
      'Dish Name *',
      'Price (',
      'Category *',
      'Detailed Description',
      'Visual Media (Optional)',
      'Dish Image',
      'Dish Video',
      'Ingredients',
      'Prep Time',
      'Spicy Level',
      'Energy (Calories kcal)',
      'Common Allergens',
      'Item Available (visible on customer menu)',
      'Featured / Signature Dish',
    ];
    for (const marker of requiredFieldMarkers) {
      if (!code.includes(marker)) {
        throw new Error(`Missing expected form field: "${marker}"`);
      }
    }
  });

  // TEST 12: Media Optionality Preserved
  assert(12, 'Optional media preserved: allows empty image, empty video, single media, or both', () => {
    if (!code.includes('Dishes are valid with no image, no video, or both')) {
      throw new Error('Missing optional media architecture banner');
    }
    if (!code.includes('image: image.trim() || null') || !code.includes('video: video.trim() || null')) {
      throw new Error('Payload must normalize empty image/video to null');
    }
  });

  console.log(`\n📊 FoodFormModal Scroll Test Results: ${passed} passed, ${failed} failed (Total: 12)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runFoodModalScrollTests().catch((err) => {
  console.error('Fatal error during food modal scroll tests:', err);
  process.exit(1);
});
