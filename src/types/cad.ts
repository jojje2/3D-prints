export interface ParameterDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export interface SpatialPin {
  id: string;
  number: number;
  /** Exact CAD coordinates in millimeters (X, Y, Z where Z is up) */
  position: [number, number, number];
  /** Surface normal unit vector in CAD coordinates (Nx, Ny, Nz) */
  normal: [number, number, number];
  /** Human-readable surface orientation, e.g., "Ovansida (+Z)" */
  surfaceLabel: string;
  /** Part name if the model has multiple named sub-parts */
  partName?: string;
  /** User's instruction for this specific point on the model */
  instruction: string;
  createdAt: string;
}

export interface CadPartMesh {
  name: string;
  color: string;
  opacity?: number;
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  edgeLines: Float32Array;
}

export interface CadModelMetrics {
  sizeX: number; // mm
  sizeY: number; // mm
  sizeZ: number; // mm
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  volumeCm3: number;
  partCount: number;
}

export interface CadModelDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: ParameterDef[];
  code: string;
  createdAt: string;
  promptUsed?: string;
}

export interface CadVersionEntry {
  id: string;
  timestamp: string;
  title: string;
  prompt: string;
  pinsSnapshot: SpatialPin[];
  code: string;
  parameters: ParameterDef[];
  paramValues: Record<string, number>;
}

export interface ApiUsageRecord {
  totalRequests: number;
  totalPromptTokens: number;
  totalCandidateTokens: number;
  estimatedCostUsd: number;
  monthlyCreditLimitUsd: number;
  lastModelUsed: string;
  lastUpdated: string;
}
