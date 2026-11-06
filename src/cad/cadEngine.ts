import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import type { CadModelMetrics, CadPartMesh } from '../types/cad';

let ocInitPromise: Promise<boolean> | null = null;
let isOcReady = false;
let prototypesPatched = false;
let lastBuiltShapes: { shape: any; name: string; color: string; opacity?: number }[] = [];

const LOCAL_FONT_URL = './fonts/default.ttf';

/**
 * Patches Replicad prototypes so that if AI-generated code specifies an oversized
 * 3D fillet/chamfer radius or degenerate boolean operation that would throw an
 * OpenCascade C++ numeric pointer exception (e.g. 10641896), it automatically retries
 * with a smaller safe radius or preserves the unfilleted 3D solid instead of crashing!
 */
function patchReplicadSafetyPrototypes() {
  if (prototypesPatched) return;
  prototypesPatched = true;

  const Shape3DProto = (replicad as any)._3DShape?.prototype;
  if (Shape3DProto) {
    const origFillet = Shape3DProto.fillet;
    if (typeof origFillet === 'function') {
      Shape3DProto.fillet = function safeFillet(radiusConfig: any, filter?: any) {
        try {
          return origFillet.call(this, radiusConfig, filter);
        } catch (err1) {
          if (typeof radiusConfig === 'number' && radiusConfig > 0.4) {
            for (const factor of [0.4, 0.15]) {
              try {
                return origFillet.call(
                  this,
                  Math.max(0.2, Number((radiusConfig * factor).toFixed(2))),
                  filter
                );
              } catch {
                // continue fallback
              }
            }
          }
          console.warn(
            'OpenCascade hoppade över 3D-fillet som var för stor för kanten:',
            err1
          );
          return this;
        }
      };
    }

    const origChamfer = Shape3DProto.chamfer;
    if (typeof origChamfer === 'function') {
      Shape3DProto.chamfer = function safeChamfer(radiusConfig: any, filter?: any) {
        try {
          return origChamfer.call(this, radiusConfig, filter);
        } catch (err1) {
          if (typeof radiusConfig === 'number' && radiusConfig > 0.4) {
            try {
              return origChamfer.call(
                this,
                Math.max(0.2, Number((radiusConfig * 0.35).toFixed(2))),
                filter
              );
            } catch {
              // continue fallback
            }
          }
          console.warn(
            'OpenCascade hoppade över 3D-chamfer som var för stor för kanten:',
            err1
          );
          return this;
        }
      };
    }

    const origShell = Shape3DProto.shell;
    if (typeof origShell === 'function') {
      Shape3DProto.shell = function safeShell(...args: any[]) {
        try {
          return origShell.apply(this, args);
        } catch (err) {
          console.warn('OpenCascade hoppade över shell-operation som ej gick att lösa:', err);
          return this;
        }
      };
    }

    const origFuse = Shape3DProto.fuse;
    if (typeof origFuse === 'function') {
      Shape3DProto.fuse = function safeFuse(other: any, opts?: any) {
        const target = other?.shape ? other.shape : other;
        if (!target) return this;
        try {
          return origFuse.call(this, target, opts);
        } catch (err) {
          console.warn('OpenCascade fuse-varning, behåller basform:', err);
          return this;
        }
      };
    }

    const origCut = Shape3DProto.cut;
    if (typeof origCut === 'function') {
      Shape3DProto.cut = function safeCut(tool: any, opts?: any) {
        const target = tool?.shape ? tool.shape : tool;
        if (!target) return this;
        try {
          return origCut.call(this, target, opts);
        } catch (err) {
          console.warn('OpenCascade cut-varning, behåller basform:', err);
          return this;
        }
      };
    }
  }

  const DrawingProto = (replicad as any).Drawing?.prototype;
  if (DrawingProto) {
    for (const method of ['fillet', 'chamfer']) {
      const orig = DrawingProto[method];
      if (typeof orig === 'function') {
        DrawingProto[method] = function safeDrawingMod(...args: any[]) {
          try {
            return orig.apply(this, args);
          } catch {
            return this;
          }
        };
      }
    }
  }
}

export async function initCadKernel(): Promise<boolean> {
  if (isOcReady) return true;
  if (ocInitPromise) return ocInitPromise;

  ocInitPromise = (async () => {
    const OC = await (opencascade as any)({
      locateFile: () => opencascadeWasm,
    });
    replicad.setOC(OC);
    patchReplicadSafetyPrototypes();

    // Load bundled TTF font for 3D text embossing/engraving (drawText / sketchText)
    try {
      await replicad.loadFont(LOCAL_FONT_URL, 'default');
    } catch (err) {
      console.warn('Kunde inte ladda lokal TTF-font:', err);
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
 * Creates a safe proxy around replicad helper functions so zero/negative radii
 * or oversized corner radii in drawRoundedRectangle never trigger C++ exceptions.
 */
function createSafeReplicadHelpers() {
  return {
    ...replicad,
    drawRectangle: (w: number, h: number) =>
      replicad.drawRectangle(
        Math.max(0.2, Math.abs(Number(w) || 10)),
        Math.max(0.2, Math.abs(Number(h) || 10))
      ),
    drawRoundedRectangle: (w: number, h: number, r: any = 2) => {
      const safeW = Math.max(0.5, Math.abs(Number(w) || 10));
      const safeH = Math.max(0.5, Math.abs(Number(h) || 10));
      const maxAllowedR = Math.min(safeW, safeH) * 0.46;
      const requestedR = typeof r === 'number' ? Math.abs(r) : 2;
      const safeR = Math.max(0, Math.min(requestedR, maxAllowedR));
      if (safeR < 0.05) {
        return replicad.drawRectangle(safeW, safeH);
      }
      return replicad.drawRoundedRectangle(safeW, safeH, safeR);
    },
    drawCircle: (r: number) =>
      replicad.drawCircle(Math.max(0.1, Math.abs(Number(r) || 5))),
    makeBaseBox: (x: number, y: number, z: number) =>
      replicad.makeBaseBox(
        Math.max(0.2, Math.abs(Number(x) || 10)),
        Math.max(0.2, Math.abs(Number(y) || 10)),
        Math.max(0.2, Math.abs(Number(z) || 10))
      ),
    makeCylinder: (
      radius: number,
      height: number,
      location?: [number, number, number],
      direction?: [number, number, number]
    ) =>
      replicad.makeCylinder(
        Math.max(0.1, Math.abs(Number(radius) || 2)),
        Math.max(0.1, Math.abs(Number(height) || 10)),
        location,
        direction
      ),
    makeSphere: (radius: number) =>
      replicad.makeSphere(Math.max(0.1, Math.abs(Number(radius) || 5))),
  };
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

  const safeReplicad = createSafeReplicadHelpers();

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
    throw new Error('CAD-koden måste definiera funktionen buildModel(params, replicad).');
  `;

  let rawResult: any;
  try {
    const runner = new Function('replicad', 'params', wrappedCode);
    rawResult = await runner(safeReplicad, { ...params });
  } catch (err: any) {
    const errText =
      typeof err === 'number'
        ? `OpenCascade C++ geometrifel (kod ${err}) — troligen en ogiltig skiss, extrudering eller boolean-operation.`
        : err?.message || String(err);
    throw new Error(`CAD-körningsfel: ${errText}`);
  }

  if (!rawResult) {
    throw new Error('CAD-funktionen returnerade ingen 3D-modell (null/undefined).');
  }

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
      // ignore if open shell
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

export function downloadSTEPFile(modelName: string) {
  const shape = getExportShape();
  const blob = shape.blobSTEP();
  const safeName = modelName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'modell';
  triggerBrowserDownload(blob, `${safeName}.step`);
}

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
