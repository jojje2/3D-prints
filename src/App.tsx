import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cpu,
  Download,
  ExternalLink,
  FileBox,
  Lock,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  downloadSTEPFile,
  downloadSTLFile,
  executeCadCode,
} from './cad/cadEngine';
import { STARTER_MODELS } from './models/starterModels';
import { CadViewer3D } from './components/CadViewer3D';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { VaultModal } from './components/VaultModal';
import {
  checkUrlMagicLinkOnBoot,
  getUnlockedApiKey,
} from './ai/cryptoVault';
import {
  generateCadWithGemini,
  getApiUsageRecord,
} from './ai/aiCadGenerator';
import type {
  ApiUsageRecord,
  CadModelMetrics,
  CadPartMesh,
  CadVersionEntry,
  ParameterDef,
  SpatialPin,
} from './types/cad';

export const App: React.FC = () => {
  const initialModel = STARTER_MODELS[0];

  const [activeModelId, setActiveModelId] = useState<string>(initialModel.id);
  const [modelName, setModelName] = useState<string>(initialModel.name);
  const [modelDescription, setModelDescription] = useState<string>(
    initialModel.description
  );
  const [lastAiExplanation, setLastAiExplanation] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ParameterDef[]>(
    initialModel.parameters
  );
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const p of initialModel.parameters) {
      map[p.key] = p.defaultValue;
    }
    return map;
  });
  const [code, setCode] = useState<string>(initialModel.code);

  const [parts, setParts] = useState<CadPartMesh[]>([]);
  const [metrics, setMetrics] = useState<CadModelMetrics | null>(null);
  const [buildTimeMs, setBuildTimeMs] = useState<number>(0);
  const [isBuilding, setIsBuilding] = useState<boolean>(true);
  const [cadError, setCadError] = useState<string | null>(null);

  // Spatial 3D Right-Click Annotation Pins
  const [pins, setPins] = useState<SpatialPin[]>([]);
  const [activePinId, setActivePinId] = useState<string | null>(null);

  // Session Version History
  const [history, setHistory] = useState<CadVersionEntry[]>([]);

  // AI & Vault Security State
  const [apiKey, setApiKey] = useState<string | null>(() => getUnlockedApiKey());
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);
  const [selectedAiModel, setSelectedAiModel] = useState<string>('gemini-2.5-flash');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [usageRecord, setUsageRecord] = useState<ApiUsageRecord>(() =>
    getApiUsageRecord()
  );
  const [showQuotaPopover, setShowQuotaPopover] = useState<boolean>(false);
  const [stlQuality, setStlQuality] = useState<'fine' | 'standard' | 'draft'>('fine');
  const [isLocalAntigravity, setIsLocalAntigravity] = useState<boolean>(false);

  // Check URL Magic Link (#vault=...) and local Antigravity server on mount
  useEffect(() => {
    checkUrlMagicLinkOnBoot().then(({ vaultLoaded, autoUnlocked }) => {
      if (autoUnlocked) {
        setApiKey(getUnlockedApiKey());
      } else if (vaultLoaded && !getUnlockedApiKey()) {
        setIsVaultOpen(true);
      }
    });

    fetch('/api/antigravity/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.connected) {
          setIsLocalAntigravity(true);
        }
      })
      .catch(() => setIsLocalAntigravity(false));
  }, []);

  // Build 3D CAD geometry whenever code or paramValues change
  const runBuild = useCallback(
    async (targetCode: string, targetParams: Record<string, number>) => {
      setIsBuilding(true);
      setCadError(null);
      try {
        const res = await executeCadCode(targetCode, targetParams);
        setParts(res.parts);
        setMetrics(res.metrics);
        setBuildTimeMs(res.buildTimeMs);
      } catch (err: any) {
        setCadError(err?.message || String(err));
      } finally {
        setIsBuilding(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      runBuild(code, paramValues);
    }, 60);
    return () => clearTimeout(timer);
  }, [code, paramValues, runBuild]);

  const handleSelectStarterModel = (id: string) => {
    const found = STARTER_MODELS.find((m) => m.id === id);
    if (!found) return;
    setActiveModelId(found.id);
    setModelName(found.name);
    setModelDescription(found.description);
    setLastAiExplanation(null);
    setParameters(found.parameters);
    const map: Record<string, number> = {};
    for (const p of found.parameters) {
      map[p.key] = p.defaultValue;
    }
    setParamValues(map);
    setCode(found.code);
    setPins([]);
    setActivePinId(null);
  };

  const handleParamChange = (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    setParamValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAddPin = (
    position: [number, number, number],
    normal: [number, number, number],
    surfaceLabel: string,
    partName: string
  ) => {
    const nextNumber =
      pins.length > 0 ? Math.max(...pins.map((p) => p.number)) + 1 : 1;
    const newPin: SpatialPin = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: nextNumber,
      position,
      normal,
      surfaceLabel,
      partName,
      instruction: '',
      createdAt: new Date().toISOString(),
    };
    setPins((prev) => [...prev, newPin]);
    setActivePinId(newPin.id);
  };

  const handleUpdatePinInstruction = (id: string, instruction: string) => {
    setPins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, instruction } : p))
    );
  };

  const handleDeletePin = (id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
    if (activePinId === id) {
      setActivePinId(null);
    }
  };

  const handleGenerateWithAi = async (
    userPrompt: string,
    modifyExisting: boolean
  ) => {
    const currentKey = apiKey || getUnlockedApiKey();
    if (!currentKey) {
      setIsVaultOpen(true);
      return;
    }

    setIsGeneratingAi(true);
    setCadError(null);
    try {
      const result = await generateCadWithGemini({
        apiKey: currentKey,
        modelName: selectedAiModel,
        userPrompt,
        pins,
        currentCode: code,
        currentParameters: parameters,
        currentParamValues: paramValues,
        currentMetrics: metrics,
        modifyExisting,
      });

      const entry: CadVersionEntry = {
        id: `ver-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: result.name,
        prompt:
          userPrompt ||
          pins.map((p) => `#${p.number}: ${p.instruction}`).join('; '),
        pinsSnapshot: [...pins],
        code: result.code,
        parameters: result.parameters,
        paramValues: result.paramValues,
      };

      setHistory((prev) => [entry, ...prev]);
      setModelName(result.name);
      setModelDescription(result.description);
      setLastAiExplanation(result.explanation);
      setParameters(result.parameters);
      setParamValues(result.paramValues);
      setCode(result.code);
      setUsageRecord(result.usage);
      setPins([]);
      setActivePinId(null);
    } catch (err: any) {
      setCadError(`AI-genereringsfel: ${err?.message || String(err)}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendToAntigravity = async (userPrompt: string) => {
    const payload = {
      modelId: activeModelId,
      modelName,
      userPrompt,
      pins,
      metrics,
      paramValues,
      currentCode: code,
    };

    const markdownSummary = [
      `### 🧊 3D-CAD Uppdrag från Antigravity 3D Studio`,
      `**Aktiv modell:** ${modelName} (${
        metrics ? `${metrics.sizeX} × ${metrics.sizeY} × ${metrics.sizeZ} mm` : ''
      })`,
      userPrompt ? `**Huvudinstruktion:** ${userPrompt}` : '',
      pins.length > 0
        ? `**Utplacerade 3D-Pins (Högerklick på modellen):**\n` +
          pins
            .map(
              (p) =>
                `- **Pin #${p.number}** (${p.surfaceLabel}) vid \`X=${p.position[0]}, Y=${p.position[1]}, Z=${p.position[2]} mm\`, Normal \`[${p.normal.join(', ')}]\`: *"${p.instruction || 'Ingen text'}"*`
            )
            .join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(markdownSummary);
    } catch {
      // ignore clipboard error
    }

    if (isLocalAntigravity) {
      try {
        await fetch('/api/antigravity/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // ignore
      }
    }
  };

  const handleRestoreVersion = (entry: CadVersionEntry) => {
    setModelName(entry.title);
    setParameters(entry.parameters);
    setParamValues(entry.paramValues);
    setCode(entry.code);
    setPins(entry.pinsSnapshot || []);
  };

  const remainingCreditUsd = Math.max(
    0,
    usageRecord.monthlyCreditLimitUsd - usageRecord.estimatedCostUsd
  );

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 px-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Boxes className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">
                Antigravity 3D CAD Studio
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                STEP + STL B-Rep
              </span>
              {isLocalAntigravity && (
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <Cpu className="w-3 h-3" />
                  Lokal Byggstation Ansluten
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Röst & Text till 3D • Högerklicks 3D-Pins • Direkt till Fusion 360 (.STEP) & Slicer (.STL)
            </p>
          </div>
        </div>

        {/* Right Controls: Quota Meter, AES-256 Vault, and STEP / STL Export */}
        <div className="flex items-center gap-2">
          {/* Quota & Credit Meter */}
          <div className="relative">
            <button
              onClick={() => setShowQuotaPopover((v) => !v)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs transition"
              title="Se AI-förbrukning och dina Google API-krediter"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300">
                Anrop: <strong className="text-white">{usageRecord.totalRequests}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono text-emerald-400">
                ${remainingCreditUsd.toFixed(2)} kvar
              </span>
            </button>

            {showQuotaPopover && (
              <div className="absolute right-0 mt-2 w-80 p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl z-50 text-xs space-y-3">
                <div className="flex items-center justify-between font-bold text-slate-100">
                  <span>Din AI-Kvot & Kreditsaldo</span>
                  <button
                    onClick={() => setShowQuotaPopover(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Genereringar i appen:</span>
                    <span className="text-white">{usageRecord.totalRequests} st</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Totalt Tokens:</span>
                    <span className="text-sky-300">
                      {(
                        usageRecord.totalPromptTokens +
                        usageRecord.totalCandidateTokens
                      ).toLocaleString('sv-SE')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Uppskattad kostnad:</span>
                    <span className="text-amber-300">
                      ${usageRecord.estimatedCostUsd.toFixed(4)} USD
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  <a
                    href="https://console.cloud.google.com/billing"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium flex items-center justify-between transition"
                  >
                    <span>Se Google Cloud Krediter ($40/mån)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium flex items-center justify-between transition"
                  >
                    <span>Google AI Studio (Anrop & Nycklar)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* AES-256 Vault Lock/Unlock Button */}
          <button
            onClick={() => setIsVaultOpen(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
              apiKey
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25 animate-pulse'
            }`}
          >
            {apiKey ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">AI Upplåst</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Lås upp AI</span>
              </>
            )}
          </button>

          <div className="h-6 w-px bg-slate-800 mx-0.5" />

          {/* Export .STEP (Fusion 360) */}
          <button
            onClick={() => downloadSTEPFile(modelName)}
            disabled={isBuilding || parts.length === 0}
            className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-sky-500/20 transition"
            title="Ladda ner äkta .STEP solid-fil för Autodesk Fusion 360"
          >
            <FileBox className="w-4 h-4" />
            <span>.STEP (Fusion 360)</span>
          </button>

          {/* Export .STL (3D Printer Slicer) */}
          <div className="flex items-center rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 overflow-hidden">
            <button
              onClick={() => downloadSTLFile(modelName, stlQuality)}
              disabled={isBuilding || parts.length === 0}
              className="px-3.5 py-2 font-bold text-xs flex items-center gap-1.5 transition"
              title="Ladda ner .STL mesh-fil för 3D-skrivare (Bambu Studio, PrusaSlicer, Cura)"
            >
              <Download className="w-4 h-4" />
              <span>.STL (3D-Print)</span>
            </button>
            <select
              value={stlQuality}
              onChange={(e) => setStlQuality(e.target.value as any)}
              className="bg-indigo-700 text-[10px] font-semibold py-2 px-1.5 border-l border-indigo-500 focus:outline-none cursor-pointer"
              title="Välj upplösning för STL-export"
            >
              <option value="fine">Fin</option>
              <option value="standard">Std</option>
              <option value="draft">Snabb</option>
            </select>
          </div>
        </div>
      </header>

      {/* Error Toast if CAD code fails */}
      {cadError && (
        <div className="bg-rose-950/90 border-b border-rose-500/50 px-4 py-2 text-xs text-rose-200 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{cadError}</span>
          </div>
          <button
            onClick={() => setCadError(null)}
            className="text-rose-300 hover:text-white font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <WorkspaceSidebar
          models={STARTER_MODELS}
          activeModelId={activeModelId}
          modelName={modelName}
          modelDescription={modelDescription}
          lastAiExplanation={lastAiExplanation}
          parameters={parameters}
          paramValues={paramValues}
          code={code}
          pins={pins}
          activePinId={activePinId}
          metrics={metrics}
          history={history}
          isGeneratingAi={isGeneratingAi}
          isLocalAntigravityAvailable={isLocalAntigravity}
          selectedAiModel={selectedAiModel}
          onSelectAiModel={setSelectedAiModel}
          onSelectStarterModel={handleSelectStarterModel}
          onParamChange={handleParamChange}
          onRunCustomCode={(newCode) => setCode(newCode)}
          onUpdatePinInstruction={handleUpdatePinInstruction}
          onDeletePin={handleDeletePin}
          onClearAllPins={() => {
            setPins([]);
            setActivePinId(null);
          }}
          onSelectPin={setActivePinId}
          onGenerateWithAi={handleGenerateWithAi}
          onSendToAntigravity={handleSendToAntigravity}
          onRestoreVersion={handleRestoreVersion}
        />

        <main className="flex-1 h-full relative overflow-hidden">
          <CadViewer3D
            parts={parts}
            metrics={metrics}
            pins={pins}
            activePinId={activePinId}
            isBuilding={isBuilding || isGeneratingAi}
            onAddPin={handleAddPin}
            onUpdatePinInstruction={handleUpdatePinInstruction}
            onDeletePin={handleDeletePin}
            onSelectPin={setActivePinId}
          />

          {/* Build time indicator */}
          {!isBuilding && buildTimeMs > 0 && (
            <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-slate-400 pointer-events-none">
              CAD B-Rep: {buildTimeMs} ms
            </div>
          )}
        </main>
      </div>

      {/* AES-256 Vault Modal */}
      <VaultModal
        isOpen={isVaultOpen}
        isUnlocked={Boolean(apiKey)}
        onClose={() => setIsVaultOpen(false)}
        onUnlocked={(key) => setApiKey(key)}
        onLocked={() => setApiKey(null)}
      />
    </div>
  );
};
