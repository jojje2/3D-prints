import React, { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import {
  Box,
  Eye,
  Grid,
  Layers,
  Maximize2,
  Mic,
  MicOff,
  MousePointerClick,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { CadModelMetrics, CadPartMesh, SpatialPin } from '../types/cad';

interface CadViewer3DProps {
  parts: CadPartMesh[];
  metrics: CadModelMetrics | null;
  pins: SpatialPin[];
  activePinId: string | null;
  isBuilding: boolean;
  onAddPin: (
    position: [number, number, number],
    normal: [number, number, number],
    surfaceLabel: string,
    partName: string
  ) => void;
  onUpdatePinInstruction: (id: string, instruction: string) => void;
  onDeletePin: (id: string) => void;
  onSelectPin: (id: string | null) => void;
}

function getSurfaceOrientationLabel(nx: number, ny: number, nz: number): string {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (az >= ax && az >= ay) {
    return nz >= 0 ? 'Ovansida (+Z)' : 'Undersida (-Z)';
  }
  if (ay >= ax && ay >= az) {
    return ny >= 0 ? 'Baksida (+Y)' : 'Framsida (-Y)';
  }
  return nx >= 0 ? 'Högersida (+X)' : 'Vänstersida (-X)';
}

interface PartMeshObjectProps {
  part: CadPartMesh;
  viewMode: 'cad' | 'solid' | 'xray' | 'wireframe';
  onRightClickSurface: (
    point: [number, number, number],
    normal: [number, number, number],
    partName: string
  ) => void;
}

const PartMeshObject: React.FC<PartMeshObjectProps> = ({
  part,
  viewMode,
  onRightClickSurface,
}) => {
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const { surfaceGeometry, edgeGeometry } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(part.vertices, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
    geom.setIndex(new THREE.BufferAttribute(part.triangles, 1));
    geom.computeBoundingSphere();

    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.BufferAttribute(part.edgeLines, 3));

    return { surfaceGeometry: geom, edgeGeometry: edges };
  }, [part]);

  return (
    <group>
      <mesh
        geometry={surfaceGeometry}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          if (e.button === 2) {
            pointerDownPos.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          const down = pointerDownPos.current;
          if (down) {
            const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            if (dist > 7) return; // User was right-click panning the camera
          }
          const pt: [number, number, number] = [
            Number(e.point.x.toFixed(1)),
            Number(e.point.y.toFixed(1)),
            Number(e.point.z.toFixed(1)),
          ];
          const n = e.face?.normal
            ? ([
                Number(e.face.normal.x.toFixed(2)),
                Number(e.face.normal.y.toFixed(2)),
                Number(e.face.normal.z.toFixed(2)),
              ] as [number, number, number])
            : ([0, 0, 1] as [number, number, number]);

          onRightClickSurface(pt, n, part.name);
        }}
      >
        <meshStandardMaterial
          color={part.color || '#38bdf8'}
          roughness={0.35}
          metalness={0.18}
          wireframe={viewMode === 'wireframe'}
          transparent={viewMode === 'xray' || (part.opacity !== undefined && part.opacity < 1)}
          opacity={viewMode === 'xray' ? 0.42 : (part.opacity ?? 1)}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {(viewMode === 'cad' || viewMode === 'xray') && part.edgeLines.length > 0 && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial
            color={viewMode === 'xray' ? '#7dd3fc' : '#0f172a'}
            linewidth={1.5}
          />
        </lineSegments>
      )}
    </group>
  );
};

const BuildPlateGrid: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <group>
      {/* 256x256 mm 3D-printer build plate rotated to lie on the XY plane (Z=0) */}
      <gridHelper
        args={[256, 25, '#334155', '#1e293b']}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.05]}
      />
      {/* Subtle build plate surface */}
      <mesh position={[0, 0, -0.15]} receiveShadow>
        <planeGeometry args={[256, 256]} />
        <meshStandardMaterial
          color="#0f172a"
          transparent
          opacity={0.55}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Coordinate Axes: Red = X, Green = Y, Blue = Z */}
      <axesHelper args={[45]} />
    </group>
  );
};

export const CadViewer3D: React.FC<CadViewer3DProps> = ({
  parts,
  metrics,
  pins,
  activePinId,
  isBuilding,
  onAddPin,
  onUpdatePinInstruction,
  onDeletePin,
  onSelectPin,
}) => {
  const [viewMode, setViewMode] = useState<'cad' | 'solid' | 'xray' | 'wireframe'>('cad');
  const [showGrid, setShowGrid] = useState(true);
  const [listeningPinId, setListeningPinId] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);

  const setCameraPreset = (pos: [number, number, number]) => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    cam.position.set(pos[0], pos[1], pos[2]);
    controlsRef.current.target.set(0, 0, metrics ? metrics.sizeZ / 2 : 15);
    controlsRef.current.update();
  };

  const togglePinVoiceDictation = (pin: SpatialPin) => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Din webbläsare saknar inbyggt röststöd (testa Chrome eller Edge).');
      return;
    }

    if (listeningPinId === pin.id) {
      setListeningPinId(null);
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'sv-SE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListeningPinId(pin.id);

    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        const nextText = pin.instruction
          ? `${pin.instruction.trim()} ${transcript.trim()}`
          : transcript.trim();
        onUpdatePinInstruction(pin.id, nextText);
      }
      setListeningPinId(null);
    };
    rec.onerror = () => setListeningPinId(null);
    rec.onend = () => setListeningPinId(null);
    rec.start();
  };

  return (
    <div
      className="relative w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 select-none overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Floating HUD: Model Dimensions & Right-Click Hint */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {metrics && (
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-lg text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-sky-400">
                <Box className="w-4 h-4" />
                <span>Mått (mm):</span>
              </div>
              <div className="font-mono text-slate-100">
                <span className="text-rose-400">X:</span> {metrics.sizeX} ×{' '}
                <span className="text-emerald-400">Y:</span> {metrics.sizeY} ×{' '}
                <span className="text-sky-400">Z:</span> {metrics.sizeZ} mm
              </div>
              {metrics.volumeCm3 > 0 && (
                <div className="pl-2 border-l border-slate-700 font-mono text-slate-300">
                  Volym: <span className="text-amber-300">{metrics.volumeCm3} cm³</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950/85 border border-indigo-500/40 backdrop-blur-md text-xs text-indigo-200 shadow-lg">
            <MousePointerClick className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>Högerklicka</strong> var som helst på 3D-modellen för att sätta en 3D-anteckning
            </span>
          </div>
        </div>

        {/* Camera & View Mode Toolbar */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-lg pointer-events-auto">
          <button
            onClick={() => setViewMode('cad')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              viewMode === 'cad'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Fusion 360-vy (Solid + skarpa CAD-kanter)"
          >
            <Layers className="w-3.5 h-3.5" />
            CAD
          </button>
          <button
            onClick={() => setViewMode('xray')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              viewMode === 'xray'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Röntgen-vy (Se inre hål & kanaler)"
          >
            <Eye className="w-3.5 h-3.5" />
            Röntgen
          </button>
          <button
            onClick={() => setViewMode('wireframe')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              viewMode === 'wireframe'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Trådram (Mesh-trianglar)"
          >
            Trådram
          </button>

          <div className="w-px h-5 bg-slate-700 mx-0.5" />

          <button
            onClick={() => setShowGrid((v) => !v)}
            className={`p-1.5 rounded-lg text-xs transition ${
              showGrid ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:bg-slate-800'
            }`}
            title="Visa/dölj 256×256 mm byggplatta"
          >
            <Grid className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-0.5" />

          <button
            onClick={() => setCameraPreset([110, -130, 95])}
            className="px-2 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-1"
            title="Återställ kamera (Isometrisk vy)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            ISO
          </button>
          <button
            onClick={() => setCameraPreset([0, -0.01, 180])}
            className="px-2 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800"
            title="Vy ovanifrån (+Z)"
          >
            Topp
          </button>
          <button
            onClick={() => setCameraPreset([0, -180, 30])}
            className="px-2 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800"
            title="Vy framifrån (-Y)"
          >
            Fram
          </button>
          <button
            onClick={() => setCameraPreset([180, 0, 30])}
            className="px-2 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800"
            title="Vy från höger (+X)"
          >
            Sida
          </button>
        </div>
      </div>

      {/* Loading / Building Overlay */}
      {isBuilding && (
        <div className="absolute inset-0 z-20 bg-slate-950/65 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-sky-400 border-t-transparent animate-spin" />
          <div className="text-sm font-medium text-sky-200">
            Beräknar B-Rep 3D-geometri (OpenCascade WASM)...
          </div>
        </div>
      )}

      {/* Three.js Canvas with Z-Up CAD Coordinate System */}
      <Canvas
        shadows
        camera={{ position: [110, -130, 95], up: [0, 0, 1], fov: 42, near: 0.5, far: 4000 }}
        onPointerMissed={(e) => {
          if (e.button === 0) onSelectPin(null);
        }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[120, -140, 180]} intensity={1.35} castShadow />
        <directionalLight position={[-120, 120, 90]} intensity={0.65} />
        <directionalLight position={[0, 100, -100]} intensity={0.35} />

        <BuildPlateGrid visible={showGrid} />

        {/* Render all CAD parts */}
        <group>
          {parts.map((part, idx) => (
            <PartMeshObject
              key={`${part.name}-${idx}`}
              part={part}
              viewMode={viewMode}
              onRightClickSurface={(point, normal, partName) => {
                const surfaceLabel = getSurfaceOrientationLabel(normal[0], normal[1], normal[2]);
                onAddPin(point, normal, surfaceLabel, partName);
              }}
            />
          ))}
        </group>

        {/* Render Spatial 3D Annotation Pins */}
        {pins.map((pin) => {
          const isSelected = activePinId === pin.id;
          return (
            <group key={pin.id} position={pin.position}>
              {/* 3D Sphere marker at exact surface intersection */}
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPin(pin.id);
                }}
              >
                <sphereGeometry args={[1.8, 20, 20]} />
                <meshStandardMaterial
                  color={isSelected ? '#f43f5e' : '#f59e0b'}
                  emissive={isSelected ? '#e11d48' : '#d97706'}
                  emissiveIntensity={0.6}
                />
              </mesh>

              {/* Floating HTML Badge + Annotation Editor in 3D space */}
              <Html
                position={[
                  pin.normal[0] * 5,
                  pin.normal[1] * 5,
                  pin.normal[2] * 5 + 3,
                ]}
                zIndexRange={[100, 0]}
              >
                <div
                  className="pointer-events-auto select-none"
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  {/* Numbered Pin Pill */}
                  <button
                    onClick={() => onSelectPin(isSelected ? null : pin.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-xl border transition transform hover:scale-105 ${
                      isSelected
                        ? 'bg-rose-500 text-white border-rose-300 ring-4 ring-rose-500/30'
                        : 'bg-amber-500 text-slate-950 border-amber-200'
                    }`}
                  >
                    <span>#{pin.number}</span>
                    {pin.instruction && !isSelected && (
                      <span className="max-w-[140px] truncate font-medium text-[11px]">
                        {pin.instruction}
                      </span>
                    )}
                  </button>

                  {/* Expanded Popover when selected */}
                  {isSelected && (
                    <div
                      className="mt-2 w-72 p-3 rounded-xl bg-slate-900/95 border border-rose-500/60 shadow-2xl backdrop-blur-md text-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-rose-400">
                          📍 Pin #{pin.number} — {pin.surfaceLabel}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onDeletePin(pin.id)}
                            className="p-1 rounded hover:bg-rose-950/80 text-slate-400 hover:text-rose-400"
                            title="Ta bort pin"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSelectPin(null)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                            title="Stäng"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 mb-2 bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                        X: {pin.position[0]} | Y: {pin.position[1]} | Z: {pin.position[2]} mm
                      </div>

                      <div className="relative">
                        <textarea
                          autoFocus
                          rows={2}
                          value={pin.instruction}
                          onChange={(e) => onUpdatePinInstruction(pin.id, e.target.value)}
                          placeholder="Vad vill du ändra här? T.ex. 'Gör ett 6 mm hål här' eller 'Gravera text här'..."
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none p-2 pr-9 text-xs text-slate-100 placeholder-slate-500 resize-none"
                        />
                        <button
                          type="button"
                          onClick={() => togglePinVoiceDictation(pin)}
                          className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition ${
                            listeningPinId === pin.id
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-slate-800 text-slate-300 hover:text-sky-400'
                          }`}
                          title="Tala in instruktion för denna punkt"
                        >
                          {listeningPinId === pin.id ? (
                            <MicOff className="w-3.5 h-3.5" />
                          ) : (
                            <Mic className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Html>
            </group>
          );
        })}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[0, 0, metrics ? Math.max(10, metrics.sizeZ / 2) : 15]}
          enableDamping
          dampingFactor={0.08}
        />

        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewport
            axisColors={['#f43f5e', '#10b981', '#38bdf8']}
            labelColor="#0f172a"
          />
        </GizmoHelper>
      </Canvas>

      {/* Bottom Left Navigation Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 backdrop-blur-sm pointer-events-none">
        <span>🖱️ Vänsterklick + dra: Rotera</span>
        <span>•</span>
        <span>Skrollhjul: Zooma</span>
        <span>•</span>
        <span>Högerklick + dra: Panorera</span>
        <span>•</span>
        <span className="text-amber-300 font-medium">Högerklick på modell: Ny 3D-pin</span>
      </div>
    </div>
  );
};
