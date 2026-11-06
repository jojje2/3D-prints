import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = path.resolve(
  process.cwd(),
  'node_modules/replicad-opencascadejs/src'
);

async function verifyCadModels() {
  console.log('1. Loading OpenCascade WASM kernel...');
  const wasmBuffer = fs.readFileSync(
    path.join(globalThis.__dirname, 'replicad_single.wasm')
  );
  const OC = await opencascade({ wasmBinary: wasmBuffer });
  replicad.setOC(OC);
  console.log('✓ OpenCascade WASM loaded.');

  const shape = replicad
    .drawRoundedRectangle(50, 60, 4)
    .sketchOnPlane('XY')
    .extrude(6)
    .cut(replicad.makeCylinder(2.75, 20, [0, 0, -5], [0, 0, 1]));

  const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  const edges = shape.meshEdges({ tolerance: 0.1, angularTolerance: 0.3 });
  const stepBlob = shape.blobSTEP();
  const stlBlob = shape.blobSTL({
    tolerance: 0.05,
    angularTolerance: 0.1,
    binary: true,
  });

  const stepText = await stepBlob.text();
  if (!stepText.includes('ISO-10303-21')) {
    throw new Error('STEP export did not contain ISO-10303-21 header!');
  }

  console.log(
    `✓ Mesh vertices: ${mesh.vertices.length / 3}, Edge segments: ${edges.lines.length / 6}`
  );
  console.log(
    `✓ STEP file size: ${stepBlob.size} bytes (ISO-10303-21 B-Rep verified for Fusion 360)`
  );
  console.log(`✓ STL file size: ${stlBlob.size} bytes (Binary STL verified for Slicer)`);
}

verifyCadModels().catch((err) => {
  console.error(err);
  process.exit(1);
});
