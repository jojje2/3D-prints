import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Lock,
  ShieldCheck,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import {
  createShareableMagicLink,
  decryptApiKeyWithPassword,
  encryptApiKeyWithPassword,
  getActiveVaultConfig,
  lockSessionKey,
  setUnlockedApiKey,
} from '../ai/cryptoVault';

interface VaultModalProps {
  isOpen: boolean;
  isUnlocked: boolean;
  onClose: () => void;
  onUnlocked: (apiKey: string) => void;
  onLocked: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  isUnlocked,
  onClose,
  onUnlocked,
  onLocked,
}) => {
  const vault = getActiveVaultConfig();
  const [tab, setTab] = useState<'unlock' | 'setup'>(
    vault.hasEncryptedVault ? 'unlock' : 'setup'
  );
  const [unlockPassword, setUnlockPassword] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(vault.hint || 'Familjelösenord');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const apiKey = await decryptApiKeyWithPassword(unlockPassword);
      setUnlockedApiKey(apiKey, true);
      onUnlocked(apiKey);
      setSuccessMsg('Kassaskåpet är upplåst! Du kan nu generera 3D-modeller.');
      setTimeout(() => onClose(), 700);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fel lösenord.');
    }
  };

  const handleCreateEncryptedVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedKey = newApiKey.trim();
    if (trimmedKey.length < 12) {
      setErrorMsg('Klistra in hela din Google API-nyckel (t.ex. "AQ.Ab8RN..." eller "AIza...").');
      return;
    }
    if (newPassword.trim().length < 4) {
      setErrorMsg('Välj ett lösenord på minst 4 tecken.');
      return;
    }

    try {
      const payload = await encryptApiKeyWithPassword(
        newApiKey.trim(),
        newPassword.trim(),
        passwordHint.trim() || 'Familjelösenord'
      );
      setUnlockedApiKey(newApiKey.trim(), true);
      onUnlocked(newApiKey.trim());

      const link = createShareableMagicLink(payload, newPassword.trim());
      setMagicLink(link);
      setSuccessMsg(
        'Nyckeln har krypterats med AES-256-GCM! Ingen kan läsa den utan ditt lösenord.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Kunde inte kryptera nyckeln.');
    }
  };

  const copyMagicLink = async () => {
    if (!magicLink) return;
    await navigator.clipboard.writeText(magicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">AES-256 Krypterat AI-Kassaskåp</h2>
              <p className="text-xs text-slate-400">
                Skyddar din Gemini-kvot på GitHub Pages (github.io)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 text-xs font-medium">
          <button
            onClick={() => {
              setTab('unlock');
              setErrorMsg(null);
            }}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              tab === 'unlock'
                ? 'border-sky-400 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Unlock className="w-4 h-4" />
            Lås upp med Lösenord
          </button>
          <button
            onClick={() => {
              setTab('setup');
              setErrorMsg(null);
            }}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              tab === 'setup'
                ? 'border-sky-400 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Konfigurera / Kryptera Nyckel
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isUnlocked && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>AI-motorn är upplåst och redo i denna webbläsare!</span>
              </div>
              <button
                onClick={() => {
                  lockSessionKey();
                  onLocked();
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
              >
                Lås
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-xs text-emerald-200">
              {successMsg}
            </div>
          )}

          {tab === 'unlock' ? (
            <form onSubmit={handleUnlock} className="space-y-4">
              {vault.hasEncryptedVault ? (
                <>
                  <div className="text-xs text-slate-300 leading-relaxed">
                    Skriv in ert familjelösenord för att låsa upp 3D-AI-generatorn. Ledtråd:{' '}
                    <span className="font-semibold text-sky-300">
                      {vault.hint || 'Familjelösenord'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Lösenord
                    </label>
                    <input
                      type="password"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      placeholder="Ange lösenord..."
                      autoFocus
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    Lås upp 3D AI-Studio
                  </button>
                </>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <Lock className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-300">
                    Inget krypterat kassaskåp har sparats ännu. Gå till fliken{' '}
                    <strong>Konfigurera / Kryptera Nyckel</strong> för att lägga in din gratis
                    Gemini API-nyckel och välja ett familjelösenord!
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('setup')}
                    className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-semibold text-xs"
                  >
                    Kryptera in din nyckel nu
                  </button>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleCreateEncryptedVault} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                <div className="font-semibold text-sky-300 flex items-center justify-between">
                  <span>Hur du hämtar din gratis Gemini API-nyckel (30 sek):</span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    Öppna Google AI Studio <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-[11px] text-slate-400">
                  1. Klicka på länken ovan och tryck på <strong>Create API key</strong>.<br />
                  2. Klistra in nyckeln nedan och välj ett lösenord som du och din fru kan.<br />
                  3. Nyckeln krypteras med AES-256 så att ingen utomstående på GitHub någonsin kan
                  se eller använda den!
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Google Gemini API-nyckel (t.ex. AQ.Ab8RN... eller AIza...)
                </label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="AQ.Ab8RN... eller AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Välj Familjelösenord
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minst 4 tecken..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ledtråd (valfritt)
                  </label>
                  <input
                    type="text"
                    value={passwordHint}
                    onChange={(e) => setPasswordHint(e.target.value)}
                    placeholder="T.ex. Familjelösenord"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Kryptera med AES-256 & Lås upp
              </button>

              {magicLink && (
                <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 space-y-2">
                  <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    Magisk Direktlänk till din fru (låser upp automatiskt!):
                  </div>
                  <p className="text-[11px] text-indigo-200/80">
                    Skicka den här länken till din fru (t.ex. på SMS/Teams). När hon klickar på den
                    låses AI-motorn upp automatiskt i hennes webbläsare utan att hon behöver skriva
                    in någon nyckel!
                  </p>
                  <button
                    type="button"
                    onClick={copyMagicLink}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4" />
                        Magisk länk kopierad!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Kopiera Magisk Länk
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
