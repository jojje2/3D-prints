import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import type { CadModelMetrics, CadPartMesh } from '../types/cad';

let ocInitPromise: Promise<boolean> | null = null;
let isOcReady = false;
let lastBuiltShapes: { shape: any; name: string; color: string; opacity?: number }[] = [];

const DEFAULT_FONT_URL =
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf';

export async function initCadKernel(): Promise<boolean> {
  if (isOcReady) return true;
  if (ocInitPromise) return ocInitPromise;

  ocInitPromise = (async () => {
    const OC = await (opencascade as any)({
      locateFile: () => opencascadeWasm,
    });
    replicad.setOC(OC);

    // Load default TTF font for 3D text embossing/engraving (drawText / sketchText)
    try {
      await replicad.loadFont(DEFAULT_FONT_URL, 'default');
    } catch (err) {
      console.warn('Could not load remote TTF font for drawText, continuing without font:', err);
    }

    isOcReady = true;
    return true;
  })();

  return ocInitPromise;
}

export interface CadBuildResult {
  parts: CadPartMesh[];
  metrics: CadModelMetrics;
  buildTimeMs: number;
}

/**
 * Executes Replicad CAD code with the given parameters and extracts
 * Three.js-ready meshes, sharp B-Rep edges, and millimeter metrics.
 */
export async function executeCadCode(
  code: string,
  params: Record<string, number>
): Promise<CadBuildResult> {
  const t0 = performance.now();
  await initCadKernel();

  // Provide both `replicad.*` and destructured top-level helpers so AI-generated
  // scripts work whether they call `makeBaseBox()` or `replicad.makeBaseBox()`.
  const wrappedCode = `
    const {
      draw,
      drawRectangle,
      drawRoundedRectangle,
      drawCircle,
      drawEllipse,
      drawPolysides,
      drawText,
      sketchOnPlane,
      sketchRectangle,
      sketchRoundedRectangle,
      sketchCircle,
      sketchPolysides,
      sketchText,
       sketchHelix,
      Sketcher,
      FaceSketcher,
      Blueprint,
      Blueprints,
      CompoundBlueprint,
      makeBaseBox,
      makeBox,
      makeCylinder,
      makeSphere,
      makeEllipsoid,
      makeCompound,
      makeSolid,
      makePolygon,
      makePlane,
      makeHelix,
      EdgeFinder,
      FaceFinder,
      Vector,
      Transformation,
      measureVolume,
      measureArea,
      loft,
      genericSweep,
    } = replicad;

    ${code}

    if (typeof buildModel === 'function') {
      return buildModel(params, replicad);
    }
    if (typeof main === 'function') {
      return main(replicad, params);
    }
    throw new Error('CAD-koden måste antingen returnera en 3D-form direkt eller definiera funktionen buildModel(params).');
  `;

  let rawResult: any;
  try {
    const runner = new Function('replicad', 'params', wrappedCode);
    rawResult = await runner(replicad, { ...params });
  } catch (err: any) {
    throw new Error(`CAD-körningsfel: ${err?.message || String(err)}`);
  }

  if (!rawResult) {
    throw new Error('CAD-funktionen returnerade ingen 3D-modell (null/undefined).');
  }

  // Normalize output into an array of { shape, name, color, opacity }
  const normalizedItems: { shape: any; name: string; color: string; opacity?: number }[] = [];
  const itemsArray = Array.isArray(rawResult) ? rawResult : [rawResult];

  itemsArray.forEach((item, idx) => {
    if (!item) return;
    if (item.shape && typeof item.shape.mesh === 'function') {
      normalizedItems.push({
        shape: item.shape,
        name: item.name || `Del ${idx + 1}`,
        color: item.color || '#38bdf8',
        opacity: item.opacity ?? 1,
      });
    } else if (typeof item.mesh === 'function') {
      normalizedItems.push({
        shape: item,
        name: `Kropp ${idx + 1}`,
        color: '#38bdf8',
        opacity: 1,
      });
    }
  });

  if (normalizedItems.length === 0) {
    throw new Error('Resultatet innehöll ingen giltig 3D-solid (Shape3D).');
  }

  lastBuiltShapes = normalizedItems;

  const parts: CadPartMesh[] = [];
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let totalVolumeMm3 = 0;

  for (const entry of normalizedItems) {
    const shape = entry.shape;

    const meshData = shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
    const edgeData = shape.meshEdges({ tolerance: 0.1, angularTolerance: 0.3 });

    parts.push({
      name: entry.name,
      color: entry.color,
      opacity: entry.opacity,
      vertices: new Float32Array(meshData.vertices),
      normals: new Float32Array(meshData.normals),
      triangles: new Uint32Array(meshData.triangles),
      edgeLines: new Float32Array(edgeData.lines),
    });

    try {
      const bbox = shape.boundingBox;
      if (bbox && bbox.bounds) {
        const [[bx1, by1, bz1], [bx2, by2, bz2]] = bbox.bounds;
        minX = Math.min(minX, bx1);
        minY = Math.min(minY, by1);
        minZ = Math.min(minZ, bz1);
        maxX = Math.max(maxX, bx2);
        maxY = Math.max(maxY, by2);
        maxZ = Math.max(maxZ, bz2);
      }
    } catch {
      // Fallback bounds from vertices
      for (let i = 0; i < meshData.vertices.length; i += 3) {
        const vx = meshData.vertices[i];
        const vy = meshData.vertices[i + 1];
        const vz = meshData.vertices[i + 2];
        minX = Math.min(minX, vx);
        minY = Math.min(minY, vy);
        minZ = Math.min(minZ, vz);
        maxX = Math.max(maxX, vx);
        maxY = Math.max(maxY, vy);
        maxZ = Math.max(maxZ, vz);
      }
    }

    try {
      totalVolumeMm3 += replicad.measureVolume(shape);
    } catch {
      // ignore if shell/open shape
    }
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  const metrics: CadModelMetrics = {
    sizeX: Number((maxX - minX).toFixed(2)),
    sizeY: Number((maxY - minY).toFixed(2)),
    sizeZ: Number((maxZ - minZ).toFixed(2)),
    boundsMin: [Number(minX.toFixed(2)), Number(minY.toFixed(2)), Number(minZ.toFixed(2))],
    boundsMax: [Number(maxX.toFixed(2)), Number(maxY.toFixed(2)), Number(maxZ.toFixed(2))],
    volumeCm3: Number((totalVolumeMm3 / 1000).toFixed(2)),
    partCount: parts.length,
  };

  return {
    parts,
    metrics,
    buildTimeMs: Math.round(performance.now() - t0),
  };
}

function getExportShape(): any {
  if (lastBuiltShapes.length === 0) {
    throw new Error('Ingen 3D-modell är genererad ännu.');
  }
  if (lastBuiltShapes.length === 1) {
    return lastBuiltShapes[0].shape;
  }
  return replicad.makeCompound(lastBuiltShapes.map((s) => s.shape));
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * Exports the active 3D B-Rep solid as an ISO-10303-21 .STEP file
 * that opens natively as an editable solid body in Autodesk Fusion 360.
 */
export function downloadSTEPFile(modelName: string) {
  const shape = getExportShape();
  const blob = shape.blobSTEP();
  const safeName = modelName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'modell';
  triggerBrowserDownload(blob, `${safeName}.step`);
}

/**
 * Exports the active 3D model as a binary or ASCII .STL file for 3D printing slicers.
 */
export function downloadSTLFile(
  modelName: string,
  quality: 'fine' | 'standard' | 'draft' = 'fine'
) {
  const shape = getExportShape();
  const toleranceMap = {
    fine: { tolerance: 0.03, angularTolerance: 0.1, binary: true },
    standard: { tolerance: 0.1, angularTolerance: 0.25, binary: true },
    draft: { tolerance: 0.3, angularTolerance: 0.5, binary: true },
  };
  const blob = shape.blobSTL(toleranceMap[quality]);
  const safeName = modelName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'modell';
  triggerBrowserDownload(blob, `${safeName}.stl`);
}
