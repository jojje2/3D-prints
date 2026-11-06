import { executeCadCode } from '../cad/cadEngine';
import type {
  ApiUsageRecord,
  CadModelMetrics,
  ParameterDef,
  SpatialPin,
} from '../types/cad';

const USAGE_STORAGE_KEY = 'agy_cad_api_usage_v1';

export function getApiUsageRecord(): ApiUsageRecord {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCandidateTokens: 0,
    estimatedCostUsd: 0,
    monthlyCreditLimitUsd: 40,
    lastModelUsed: 'gemini-2.5-flash',
    lastUpdated: new Date().toISOString(),
  };
}

export function recordApiUsage(
  promptTokens: number,
  candidateTokens: number,
  modelName: string
): ApiUsageRecord {
  const current = getApiUsageRecord();
  const isPro = modelName.includes('pro');
  // Approximate per-token pricing in USD
  const inputRatePerMillion = isPro ? 1.25 : 0.15;
  const outputRatePerMillion = isPro ? 10.0 : 0.6;

  const costDelta =
    (promptTokens / 1_000_000) * inputRatePerMillion +
    (candidateTokens / 1_000_000) * outputRatePerMillion;

  const updated: ApiUsageRecord = {
    totalRequests: current.totalRequests + 1,
    totalPromptTokens: current.totalPromptTokens + promptTokens,
    totalCandidateTokens: current.totalCandidateTokens + candidateTokens,
    estimatedCostUsd: Number((current.estimatedCostUsd + costDelta).toFixed(5)),
    monthlyCreditLimitUsd: current.monthlyCreditLimitUsd || 40,
    lastModelUsed: modelName,
    lastUpdated: new Date().toISOString(),
  };

  localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

const REPLICAD_SYSTEM_PROMPT = `Du är en expert-CAD-ingenjör för 3D-utskrift och Autodesk Fusion 360.
Du skriver parametriska B-Rep 3D-modeller i JavaScript för biblioteket Replicad (OpenCascade).
Alla mått är i millimeter (mm). Z-axeln är UPPÅT (+Z), XY-planet (Z=0) är 3D-skrivarens byggplatta.

VIKTIGA REGLER FÖR REPLICAD-KOD:
1. Din kod MÅSTE definiera funktionen:
   function buildModel(params, replicad) { ... }
2. Alla vanliga Replicad-funktioner finns både globalt och på \`replicad\`:
   - 2D-ritning (returnerar Blueprint / Drawing på 2D-plan):
     * \`drawRectangle(width, height)\` (centrerad kring [0,0])
     * \`drawRoundedRectangle(width, height, radius)\` (centrerad kring [0,0])
     * \`drawCircle(radius)\` (centrerad kring [0,0])
     * \`drawPolysides(radius, sidesCount)\`
     * \`drawText(textString, { fontSize: 10, startX: 0, startY: 0 })\` (skapar 2D-text som kan extruderas med \`.sketchOnPlane("XY", zHeight).extrude(depth)\`)
     * \`draw([startX, startY]).lineTo([x, y]).vLine(dy).hLine(dx).threePointsArcTo([x2,y2], [viaX,viaY]).close()\`
   - 2D-transformering innan extrudering:
     * \`.translate(dx, dy)\`, \`.rotate(angleDeg)\`, \`.cut(otherDrawing)\`, \`.fuse(otherDrawing)\`
   - Från 2D till 3D:
     * \`drawing.sketchOnPlane("XY", zOffset).extrude(height)\` (plan kan vara "XY", "XZ", "YZ", och andra argumentet är offset längs planets normal)
     * \`drawing.sketchOnPlane("XZ").revolve([0, 0, 1])\`
   - 3D-primitiver (direkt i 3D-rymden):
     * \`makeBaseBox(xLen, yLen, zLen)\` (centrerad i X och Y, står på Z=0 upp till zLen)
     * \`makeBox([x1, y1, z1], [x2, y2, z2])\` (mellan två 3D-hörnpunkter)
     * \`makeCylinder(radius, height, [locX, locY, locZ], [dirX, dirY, dirZ])\`
     * \`makeSphere(radius)\` (centrerad i [0,0,0], använd \`.translate(x,y,z)\` för att flytta)
   - 3D-operationer på Shape3D:
     * \`shape.fuse(otherShape)\` (slå ihop)
     * \`shape.cut(toolShape)\` (skär bort hål / urgröpning / graverad text)
     * \`shape.intersect(otherShape)\`
     * \`shape.translate(dx, dy, dz)\` eller \`shape.translate([dx, dy, dz])\`
     * \`shape.rotate(angleDeg, [originX, originY, originZ], [axisX, axisY, axisZ])\`
     * \`shape.fillet(radius)\` eller \`shape.chamfer(dist)\` (var försiktig med för stor radie så att inte OpenCascade kraschar; använd små säkra värden eller undvik fillet efter komplicerade boolean cuts om det inte behövs)
3. Returnera antingen:
   \`{ shape: mySolid, name: "Modellnamn", color: "#38bdf8" }\`
   eller en array av sådana objekt om modellen har flera olikfärgade delar!
4. NÄR ANVÄNDAREN HAR SATT UT 3D-PINS (HÖGERKLICKS-ANNOTERINGAR):
   - Varje 3D-pin anger exakt \`position: [X, Y, Z]\` i millimeter på den befintliga modellen samt \`normal: [Nx, Ny, Nz]\` (vilket håll ytan pekar åt).
   - Utför ändringen (t.ex. hål, text, utbuktning, breddning, fasning) vid EXAKT dessa koordinater eller på den utpekade delen av modellen!
   - Om användaren ber om text vid en pin \`[px, py, pz]\`: använd \`drawText("TEXT", { fontSize: ... })\`, centrera/placera den vid rätt koordinat och \`extrude\` + \`fuse\` (upphöjd text) eller \`cut\` (graverad text).

DU MÅSTE SVARA MED ENDAST GILTIG JSON ENLIGT DETTA FORMAT (inga markdown-staket runt JSON om möjligt, eller ren JSON):
{
  "name": "Kort svenskt namn på modellen",
  "description": "Kort beskrivning på svenska av vad som skapades/ändrades",
  "explanation": "Förklaring till användaren vad du har gjort (och hur du hanterade eventuella 3D-pins)",
  "parameters": [
    { "key": "width", "label": "Bredd (X)", "min": 10, "max": 200, "step": 1, "defaultValue": 60, "unit": "mm" }
  ],
  "code": "function buildModel(params, replicad) {\\n  ...\\n}"
}`;

export interface AiCadGenerateOptions {
  apiKey: string;
  modelName?: string;
  userPrompt: string;
  pins: SpatialPin[];
  currentCode: string;
  currentParameters: ParameterDef[];
  currentParamValues: Record<string, number>;
  currentMetrics: CadModelMetrics | null;
  modifyExisting: boolean;
}

export interface AiCadGenerateResponse {
  name: string;
  description: string;
  explanation: string;
  parameters: ParameterDef[];
  paramValues: Record<string, number>;
  code: string;
  usage: ApiUsageRecord;
}

function extractJsonObject(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown code fences if present
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Kunde inte tolka JSON-svaret från AI-modellen.');
  }
}

async function callGeminiEndpoint(
  apiKey: string,
  modelName: string,
  userContent: string
): Promise<{ parsed: any; usage: ApiUsageRecord }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: REPLICAD_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userContent }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let msg = `Gemini API-fel (${res.status})`;
    try {
      const errJson = JSON.parse(errBody);
      msg = errJson?.error?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    throw new Error('AI-modellen returnerade ett tomt svar.');
  }

  const promptTokens = data?.usageMetadata?.promptTokenCount || 0;
  const candidateTokens = data?.usageMetadata?.candidatesTokenCount || 0;
  const usage = recordApiUsage(promptTokens, candidateTokens, modelName);

  const parsed = extractJsonObject(rawText);
  return { parsed, usage };
}

export async function generateCadWithGemini(
  options: AiCadGenerateOptions
): Promise<AiCadGenerateResponse> {
  const modelName = options.modelName || 'gemini-2.5-flash';

  const pinsSection =
    options.pins.length > 0
      ? `\nUTPLACERADE 3D-ANNOTERINGAR (HÖGERKLICKS-PINS PÅ MODELLEN):\n` +
        options.pins
          .map(
            (p) =>
              `- Pin #${p.number} vid exakt 3D-koordinat [X=${p.position[0]} mm, Y=${p.position[1]} mm, Z=${p.position[2]} mm], Ytnormal=[${p.normal[0]}, ${p.normal[1]}, ${p.normal[2]}] (${p.surfaceLabel}): "${p.instruction}"`
          )
          .join('\n')
      : '\nInga 3D-pins utplacerade.';

  const contextSection = options.modifyExisting
    ? `\nNUVARANDE MODELL ATT UPPDATERA / MODIFIERA:
Nuvarande mått (Bounding Box): ${
        options.currentMetrics
          ? `X=${options.currentMetrics.sizeX} mm, Y=${options.currentMetrics.sizeY} mm, Z=${options.currentMetrics.sizeZ} mm (Bounds min: [${options.currentMetrics.boundsMin.join(', ')}], max: [${options.currentMetrics.boundsMax.join(', ')}])`
          : 'Okänt'
      }
Nuvarande parametervärden: ${JSON.stringify(options.currentParamValues)}
Nuvarande Replicad-kod:
\`\`\`javascript
${options.currentCode}
\`\`\`
`
    : `\nSkapa en helt ny 3D-modell utifrån användarens beskrivning.`;

  const fullPrompt = `ANVÄNDARENS INSTRUKTION:
"${options.userPrompt || 'Uppdatera modellen enligt utplacerade 3D-pins.'}"
${pinsSection}
${contextSection}

Generera komplett, fungerande Replicad B-Rep-kod (\`buildModel(params, replicad)\`) och tillhörande \`parameters\` i JSON.`;

  let { parsed, usage } = await callGeminiEndpoint(options.apiKey, modelName, fullPrompt);

  const buildDefaultParams = (paramDefs: ParameterDef[]): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const p of paramDefs || []) {
      map[p.key] =
        options.modifyExisting && options.currentParamValues[p.key] !== undefined
          ? Number(p.defaultValue ?? options.currentParamValues[p.key])
          : Number(p.defaultValue ?? p.min ?? 10);
    }
    return map;
  };

  let parameters: ParameterDef[] = Array.isArray(parsed.parameters) ? parsed.parameters : [];
  let paramValues = buildDefaultParams(parameters);
  let code: string = parsed.code || '';

  // Self-healing check: Test executing the generated CAD code in OpenCascade WASM right away.
  // If it throws a geometry or runtime error, ask Gemini once to fix the error automatically!
  try {
    await executeCadCode(code, paramValues);
  } catch (cadError: any) {
    console.warn('First CAD pass had error, running auto-repair:', cadError?.message);
    const repairPrompt = `Din genererade Replicad-kod gav följande fel när den kördes i OpenCascade:
FELMEDDELANDE: ${cadError?.message || String(cadError)}

KOD SOM GAV FEL:
\`\`\`javascript
${code}
\`\`\`

Ursprungligt uppdrag: "${options.userPrompt}"
${pinsSection}

Åtgärda felet (t.ex. ta bort problematisk fillet/chamfer eller rätta funktionsanropet) och returnera komplett JSON i samma format.`;

    const repaired = await callGeminiEndpoint(options.apiKey, modelName, repairPrompt);
    parsed = repaired.parsed;
    usage = repaired.usage;
    parameters = Array.isArray(parsed.parameters) ? parsed.parameters : parameters;
    paramValues = buildDefaultParams(parameters);
    code = parsed.code || code;
  }

  return {
    name: parsed.name || 'Genererad 3D-Modell',
    description: parsed.description || '',
    explanation: parsed.explanation || '3D-modellen har genererats.',
    parameters,
    paramValues,
    code,
    usage,
  };
}
