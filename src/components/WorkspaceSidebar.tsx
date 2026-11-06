import React, { useState } from 'react';
import {
  Check,
  Code2,
  FolderKanban,
  History,
  MapPin,
  Mic,
  MicOff,
  Play,
  PlusCircle,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  CadModelDefinition,
  CadModelMetrics,
  CadVersionEntry,
  ParameterDef,
  SpatialPin,
} from '../types/cad';

interface WorkspaceSidebarProps {
  models: CadModelDefinition[];
  activeModelId: string;
  modelName: string;
  modelDescription: string;
  lastAiExplanation: string | null;
  parameters: ParameterDef[];
  paramValues: Record<string, number>;
  code: string;
  pins: SpatialPin[];
  activePinId: string | null;
  metrics: CadModelMetrics | null;
  history: CadVersionEntry[];
  isGeneratingAi: boolean;
  isLocalAntigravityAvailable: boolean;
  selectedAiModel: string;
  onSelectAiModel: (m: string) => void;
  onSelectStarterModel: (id: string) => void;
  onParamChange: (key: string, value: number) => void;
  onRunCustomCode: (newCode: string) => void;
  onUpdatePinInstruction: (id: string, text: string) => void;
  onDeletePin: (id: string) => void;
  onClearAllPins: () => void;
  onSelectPin: (id: string | null) => void;
  onGenerateWithAi: (prompt: string, modifyExisting: boolean) => void;
  onSendToAntigravity: (prompt: string) => Promise<void>;
  onRestoreVersion: (entry: CadVersionEntry) => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  models,
  activeModelId,
  modelName,
  modelDescription,
  lastAiExplanation,
  parameters,
  paramValues,
  code,
  pins,
  activePinId,
  history,
  isGeneratingAi,
  isLocalAntigravityAvailable,
  selectedAiModel,
  onSelectAiModel,
  onSelectStarterModel,
  onParamChange,
  onRunCustomCode,
  onUpdatePinInstruction,
  onDeletePin,
  onClearAllPins,
  onSelectPin,
  onGenerateWithAi,
  onSendToAntigravity,
  onRestoreVersion,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'params' | 'library' | 'code'>('prompt');
  const [promptText, setPromptText] = useState('');
  const [modifyExisting, setModifyExisting] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<'sv-SE' | 'en-US'>('sv-SE');
  const [editableCode, setEditableCode] = useState(code);
  const [antigravitySent, setAntigravitySent] = useState(false);

  React.useEffect(() => {
    setEditableCode(code);
  }, [code]);

  const toggleVoiceRecording = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Din webbläsare stödjer inte Web Speech API. Använd gärna Chrome eller Edge.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const rec = new SpeechRec();
    rec.lang = speechLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setIsListening(true);

    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setPromptText((prev) => (prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()));
      }
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleTriggerGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() && pins.length === 0) return;
    onGenerateWithAi(promptText, modifyExisting);
  };

  const handleTriggerAntigravity = async () => {
    await onSendToAntigravity(promptText);
    setAntigravitySent(true);
    setTimeout(() => setAntigravitySent(false), 3500);
  };

  return (
    <aside className="w-full md:w-[410px] shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
      {/* Model Title Banner */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
          Aktiv 3D-Modell
        </div>
        <h2 className="text-sm font-bold text-slate-100 truncate">{modelName}</h2>
        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{modelDescription}</p>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/30 text-[11px] font-medium">
        <button
          onClick={() => setActiveTab('prompt')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            activeTab === 'prompt'
              ? 'border-sky-400 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          <span>AI & Pins {pins.length > 0 ? `(${pins.length})` : ''}</span>
        </button>
        <button
          onClick={() => setActiveTab('params')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            activeTab === 'params'
              ? 'border-sky-400 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Mått ({parameters.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            activeTab === 'library'
              ? 'border-sky-400 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>Bibliotek</span>
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            activeTab === 'code'
              ? 'border-sky-400 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>CAD-Kod</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'prompt' && (
          <>
            {/* Mode Switcher: Modify Current vs Create New */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setModifyExisting(true)}
                className={`py-2 px-2.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition ${
                  modifyExisting
                    ? 'bg-sky-500 text-slate-950 font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ändra denna modell
              </button>
              <button
                type="button"
                onClick={() => setModifyExisting(false)}
                className={`py-2 px-2.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition ${
                  !modifyExisting
                    ? 'bg-sky-500 text-slate-950 font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Skapa helt ny
              </button>
            </div>

            {/* Voice & Text Prompt Box */}
            <form onSubmit={handleTriggerGenerate} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-200">
                    Förklara vad du vill skapa eller ändra:
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSpeechLang((l) => (l === 'sv-SE' ? 'en-US' : 'sv-SE'))
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 hover:bg-slate-700"
                      title="Byt språk för röstinspelning"
                    >
                      {speechLang === 'sv-SE' ? '🇸🇪 Svenska' : '🇬🇧 English'}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={4}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder={
                      modifyExisting
                        ? "Skriv eller tryck på mikrofonen... T.ex. 'Gör basplattan 20 mm längre och lägg till texten JORGE på ovansidan'"
                        : "Beskriv en helt ny 3D-modell... T.ex. 'Skapa en vägghållare för en borrmaskin med två skruvhål'"
                    }
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none p-3 pr-12 text-xs text-slate-100 placeholder-slate-500 leading-relaxed resize-none"
                  />

                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`absolute right-2.5 bottom-2.5 p-2.5 rounded-xl shadow-lg transition flex items-center justify-center ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse ring-4 ring-rose-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700'
                    }`}
                    title="Prata via mikrofonen (Tal-till-text)"
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                {isListening && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-rose-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    Lyssnar på mikrofonen ({speechLang})... Prata nu!
                  </div>
                )}
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Gör alla kanter mjukt rundade',
                  'Lägg till ett 6 mm centrumhål',
                  'Skapa en kabelhållare för skrivbordet',
                  'Gör en cylinderformad pennburk med bikakemönster',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setPromptText(sample)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 transition"
                  >
                    + {sample}
                  </button>
                ))}
              </div>

              {/* Spatial 3D Right-Click Pins Section */}
              <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>3D-Pins i modellen ({pins.length})</span>
                  </div>
                  {pins.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAllPins}
                      className="text-[11px] text-slate-400 hover:text-rose-400"
                    >
                      Rensa alla
                    </button>
                  )}
                </div>

                {pins.length === 0 ? (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>Tips:</strong> Högerklicka direkt på en yta eller kant i 3D-viewern för
                    att fästa en 3D-pin och beskriva exakt vad som ska ändras på den punkten!
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {pins.map((pin) => (
                      <div
                        key={pin.id}
                        onClick={() => onSelectPin(pin.id)}
                        className={`p-2.5 rounded-lg border text-xs transition cursor-pointer ${
                          activePinId === pin.id
                            ? 'bg-rose-950/30 border-rose-500/60'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-amber-300">
                            #{pin.number} • {pin.surfaceLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-400">
                              [{pin.position.join(', ')} mm]
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePin(pin.id);
                              }}
                              className="text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={pin.instruction}
                          onChange={(e) => onUpdatePinInstruction(pin.id, e.target.value)}
                          placeholder="Beskriv ändring vid denna punkt..."
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs text-slate-100"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Model Selector */}
              <div className="flex items-center justify-between text-xs bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
                <span className="text-slate-400">Gemini AI-motor:</span>
                <select
                  value={selectedAiModel}
                  onChange={(e) => onSelectAiModel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-sky-300 focus:outline-none"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Snabb & Gratis)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Avancerad CAD)</option>
                </select>
              </div>

              {/* Primary Generate Button */}
              <button
                type="submit"
                disabled={isGeneratingAi || (!promptText.trim() && pins.length === 0)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition"
              >
                <Wand2 className="w-4 h-4" />
                {isGeneratingAi
                  ? 'Genererar ny 3D-modell...'
                  : modifyExisting
                  ? 'Uppdatera 3D-Modell med AI'
                  : 'Generera Ny 3D-Modell med AI'}
              </button>

              {/* Secondary Button: Send directly to Antigravity (Local Build Station / Clipboard) */}
              <button
                type="button"
                onClick={handleTriggerAntigravity}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
                title="Sparar din prompt + alla 3D-pins direkt till Antigravity i projektmappen (och kopierar till urklipp)"
              >
                {antigravitySent ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">
                      {isLocalAntigravityAvailable
                        ? 'Skickat till Antigravity (active-request.json)!'
                        : 'Kopierat till urklipp för Antigravity!'}
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {isLocalAntigravityAvailable
                        ? 'Synka uppdrag direkt till Antigravity (Lokalt)'
                        : 'Kopiera uppdrag & 3D-pins till Antigravity'}
                    </span>
                  </>
                )}
              </button>
            </form>

            {/* AI Explanation Card */}
            {lastAiExplanation && (
              <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs text-sky-100 space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI-Designerns rapport:
                </div>
                <p className="text-slate-300 leading-relaxed">{lastAiExplanation}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'params' && (
          <div className="space-y-4">
            <div className="text-xs text-slate-400">
              Dra i reglagen nedan för att ändra modellens mått i realtid innan du exporterar till{' '}
              <strong>.STEP (Fusion 360)</strong> eller <strong>.STL</strong>:
            </div>

            {parameters.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                Denna modell har inga parametriska reglage definierade.
              </div>
            ) : (
              <div className="space-y-3">
                {parameters.map((param) => {
                  const val = paramValues[param.key] ?? param.defaultValue;
                  return (
                    <div
                      key={param.key}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-200">{param.label}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={val}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                            className="w-16 px-1.5 py-0.5 text-right font-mono text-xs bg-slate-900 border border-slate-700 rounded text-sky-300"
                          />
                          <span className="text-slate-400 text-[11px]">{param.unit || 'mm'}</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={val}
                        onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>
                          {param.min} {param.unit || 'mm'}
                        </span>
                        <span>
                          {param.max} {param.unit || 'mm'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Färdiga Parametriska CAD-Modeller
              </h3>
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelectStarterModel(m.id)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    activeModelId === m.id
                      ? 'bg-sky-500/10 border-sky-500/60 text-slate-100'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300">{m.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {m.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{m.description}</p>
                </button>
              ))}
            </div>

            {history.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Genereringshistorik i sessionen ({history.length})
                </h3>
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => onRestoreVersion(h)}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/40 text-xs space-y-1 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{h.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(h.timestamp).toLocaleTimeString('sv-SE')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{h.prompt}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Replicad / OpenCascade B-Rep JavaScript:
              </span>
              <button
                onClick={() => onRunCustomCode(editableCode)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Kör CAD-kod
              </button>
            </div>
            <textarea
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
              spellCheck={false}
              className="w-full flex-1 min-h-[360px] rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-400 focus:outline-none p-3 font-mono text-xs text-sky-200 leading-relaxed"
            />
          </div>
        )}
      </div>
    </aside>
  );
};
