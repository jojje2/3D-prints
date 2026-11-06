# Antigravity 3D CAD Studio 🧊

Interaktiv 3D-CAD-arbetsstation för röst- och textstyrda 3D-modeller med äkta B-Rep-geometri (**Replicad / OpenCascade WASM**).

- **Live på GitHub Pages:** [https://jojje2.github.io/3D-prints/](https://jojje2.github.io/3D-prints/)
- **Exportformat:**
  - **`.STEP` (AP214)** — Öppnas direkt i **Autodesk Fusion 360** som en äkta redigerbar solid kropp.
  - **`.STL` (Binär)** — Redo för 3D-skrivare / Slicer (Bambu Studio, PrusaSlicer, Cura).
- **3D-Annoteringar med Högerklick:** Högerklicka var som helst på 3D-modellen för att placera en numrerad 3D-pin (`#1`, `#2`, ...) med exakta millimeterkoordinater `(X, Y, Z)` och ytnormal, och skriv eller tala in vad som ska ändras just där.
- **AES-256 Krypterat AI-Kassaskåp:** Din Gemini API-nyckel krypteras i webbläsaren med AES-256-GCM bakom ditt valda familjelösenord (eller delas via en Magisk Länk) så att ingen nyckel någonsin exponeras i klartext på GitHub.
- **Direktkoppling till Antigravity:** När appen körs lokalt (`npm run dev`) synkas dina instruktioner och 3D-pins direkt till `workspace/active-request.json`.

## Köra lokalt på byggstationen

```bash
npm install
npm run dev
```
