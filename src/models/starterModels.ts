import type { CadModelDefinition } from '../types/cad';

export const STARTER_MODELS: CadModelDefinition[] = [
  {
    id: 'mounting-bracket-pro',
    name: 'Förstärkt Monteringsfäste (L-Konsol)',
    description:
      'Parametriskt L-fäste med rundade hörn, genomgående M-skruvhål och sidoförstärkningar. Redo för 3D-print och Fusion 360.',
    category: 'Mekanik & Fästen',
    createdAt: '2026-11-06T01:00:00Z',
    parameters: [
      { key: 'width', label: 'Bredd (X)', min: 25, max: 120, step: 1, defaultValue: 50, unit: 'mm' },
      { key: 'baseLength', label: 'Baslängd (Y)', min: 30, max: 140, step: 1, defaultValue: 60, unit: 'mm' },
      { key: 'wallHeight', label: 'Vägg-höjd (Z)', min: 25, max: 120, step: 1, defaultValue: 50, unit: 'mm' },
      { key: 'thickness', label: 'Godstjocklek', min: 3, max: 15, step: 0.5, defaultValue: 6, unit: 'mm' },
      { key: 'holeDia', label: 'Skruvhål (Ø)', min: 3, max: 12, step: 0.5, defaultValue: 5.5, unit: 'mm' },
      { key: 'cornerRadius', label: 'Hörnradie', min: 1, max: 10, step: 0.5, defaultValue: 4, unit: 'mm' },
    ],
    code: `function buildModel(params, replicad) {
  const {
    width = 50,
    baseLength = 60,
    wallHeight = 50,
    thickness = 6,
    holeDia = 5.5,
    cornerRadius = 4,
  } = params;

  const r = Math.min(cornerRadius, width / 4, baseLength / 4);
  const holeRadius = holeDia / 2;

  // 1. Horisontell basplatta centrerad i X, från Y=0 till Y=baseLength
  let base = drawRoundedRectangle(width, baseLength, r)
    .translate(0, baseLength / 2)
    .sketchOnPlane("XY")
    .extrude(thickness);

  // 2. Vertikal ryggplatta vid Y = thickness / 2
  let wall = drawRoundedRectangle(width, wallHeight, r)
    .translate(0, wallHeight / 2)
    .sketchOnPlane("XZ", -thickness)
    .extrude(thickness);

  let bracket = base.fuse(wall);

  // 3. Två triangulära förstärkningsribbor (gussets) längs sidorna
  const ribThick = Math.max(3, thickness * 0.75);
  const ribLen = Math.max(10, baseLength - thickness - 8);
  const ribHeight = Math.max(10, wallHeight - thickness - 8);

  const ribProfile = draw([thickness, thickness])
    .lineTo([thickness + ribLen, thickness])
    .lineTo([thickness, thickness + ribHeight])
    .close();

  const leftRib = ribProfile
    .sketchOnPlane("YZ", -width / 2)
    .extrude(ribThick);

  const rightRib = ribProfile
    .sketchOnPlane("YZ", width / 2 - ribThick)
    .extrude(ribThick);

  bracket = bracket.fuse(leftRib).fuse(rightRib);

  // 4. Två monteringshål i basplattan
  const holeXOffset = Math.max(holeRadius + 4, width * 0.26);
  const holeYPos = thickness + (baseLength - thickness) * 0.58;

  const baseHole1 = makeCylinder(
    holeRadius,
    thickness * 3,
    [-holeXOffset, holeYPos, -thickness],
    [0, 0, 1]
  );
  const baseHole2 = makeCylinder(
    holeRadius,
    thickness * 3,
    [holeXOffset, holeYPos, -thickness],
    [0, 0, 1]
  );

  // 5. Två monteringshål i den vertikala väggen
  const holeZPos = thickness + (wallHeight - thickness) * 0.6;
  const wallHole1 = makeCylinder(
    holeRadius,
    thickness * 3,
    [-holeXOffset, -thickness, holeZPos],
    [0, 1, 0]
  );
  const wallHole2 = makeCylinder(
    holeRadius,
    thickness * 3,
    [holeXOffset, -thickness, holeZPos],
    [0, 1, 0]
  );

  bracket = bracket
    .cut(baseHole1)
    .cut(baseHole2)
    .cut(wallHole1)
    .cut(wallHole2);

  return {
    shape: bracket,
    name: "Monteringsfäste",
    color: "#38bdf8",
  };
}`,
  },
  {
    id: 'cable-desk-organizer',
    name: 'Skrivbordshållare & Kabelklämma (5 Spår)',
    description:
      'Kabelhållare och skrivbordsorganiserare med mjukt rundade spår som håller laddkablar på plats.',
    category: 'Kontor & Organisering',
    createdAt: '2026-11-06T01:05:00Z',
    parameters: [
      { key: 'length', label: 'Totallängd (X)', min: 50, max: 180, step: 2, defaultValue: 96, unit: 'mm' },
      { key: 'depth', label: 'Djup (Y)', min: 20, max: 60, step: 1, defaultValue: 32, unit: 'mm' },
      { key: 'height', label: 'Höjd (Z)', min: 12, max: 40, step: 1, defaultValue: 18, unit: 'mm' },
      { key: 'slotWidth', label: 'Kabelspår bredd', min: 3, max: 10, step: 0.5, defaultValue: 5.5, unit: 'mm' },
      { key: 'slotCount', label: 'Antal spår', min: 2, max: 8, step: 1, defaultValue: 5, unit: 'st' },
    ],
    code: `function buildModel(params, replicad) {
  const {
    length = 96,
    depth = 32,
    height = 18,
    slotWidth = 5.5,
    slotCount = 5,
  } = params;

  const numSlots = Math.round(slotCount);
  let body = drawRoundedRectangle(length, depth, Math.min(8, depth / 3))
    .sketchOnPlane("XY")
    .extrude(height)
    .chamfer(1.5, (e) => e.inPlane("XY", height));

  const spacing = length / (numSlots + 1);
  const startX = -length / 2 + spacing;
  const innerRadius = slotWidth * 0.72;
  const slotCenterZ = height * 0.55;

  for (let i = 0; i < numSlots; i++) {
    const xPos = startX + i * spacing;

    // Cylindrisk kabelkanal längs Y-axeln
    const channel = makeCylinder(
      innerRadius,
      depth * 2,
      [xPos, -depth, slotCenterZ],
      [0, 1, 0]
    );

    // Öppning uppåt (lite smalare för snap-in effekt)
    const neckWidth = slotWidth * 0.88;
    const neck = drawRectangle(neckWidth, depth * 2)
      .translate(xPos, 0)
      .sketchOnPlane("XY", slotCenterZ)
      .extrude(height);

    body = body.cut(channel).cut(neck);
  }

  return {
    shape: body,
    name: "Kabelhållare",
    color: "#34d399",
  };
}`,
  },
  {
    id: 'electronics-enclosure-box',
    name: 'Elektroniklåda med Skruvdistanser',
    description:
      'Parametrisk apparatlåda med urholkat inre, 4 integrerade kretskorts-distanser (PCB standoffs) och kabelgenomföring.',
    category: 'Elektronik & Kapslingar',
    createdAt: '2026-11-06T01:10:00Z',
    parameters: [
      { key: 'boxWidth', label: 'Bredd (X)', min: 40, max: 160, step: 2, defaultValue: 80, unit: 'mm' },
      { key: 'boxDepth', label: 'Djup (Y)', min: 40, max: 160, step: 2, defaultValue: 60, unit: 'mm' },
      { key: 'boxHeight', label: 'Höjd (Z)', min: 20, max: 80, step: 1, defaultValue: 32, unit: 'mm' },
      { key: 'wall', label: 'Väggtjocklek', min: 1.6, max: 6, step: 0.4, defaultValue: 2.8, unit: 'mm' },
      { key: 'portDia', label: 'Kabelhål (Ø)', min: 4, max: 20, step: 1, defaultValue: 10, unit: 'mm' },
    ],
    code: `function buildModel(params, replicad) {
  const {
    boxWidth = 80,
    boxDepth = 60,
    boxHeight = 32,
    wall = 2.8,
    portDia = 10,
  } = params;

  const outerR = 5;
  const innerR = Math.max(1, outerR - wall);

  const outerBox = drawRoundedRectangle(boxWidth, boxDepth, outerR)
    .sketchOnPlane("XY")
    .extrude(boxHeight);

  const innerCut = drawRoundedRectangle(boxWidth - wall * 2, boxDepth - wall * 2, innerR)
    .sketchOnPlane("XY", wall)
    .extrude(boxHeight);

  let enclosure = outerBox.cut(innerCut);

  // 4 skruvdistanser i hörnen
  const postOffsetX = boxWidth / 2 - wall - 4.5;
  const postOffsetY = boxDepth / 2 - wall - 4.5;
  const postHeight = Math.max(6, boxHeight * 0.45);
  const corners = [
    [-postOffsetX, -postOffsetY],
    [postOffsetX, -postOffsetY],
    [-postOffsetX, postOffsetY],
    [postOffsetX, postOffsetY],
  ];

  for (const [cx, cy] of corners) {
    const post = makeCylinder(4, postHeight, [cx, cy, wall], [0, 0, 1]);
    const screwHole = makeCylinder(1.5, postHeight + 1, [cx, cy, wall + 2], [0, 0, 1]);
    enclosure = enclosure.fuse(post).cut(screwHole);
  }

  // Kabelgenomföring på kortsidan (+X)
  const cableHole = makeCylinder(
    portDia / 2,
    wall * 4,
    [boxWidth / 2 - wall * 2, 0, boxHeight * 0.55],
    [1, 0, 0]
  );
  enclosure = enclosure.cut(cableHole);

  return {
    shape: enclosure,
    name: "Elektroniklåda",
    color: "#818cf8",
  };
}`,
  },
  {
    id: 'flanged-bushing-gear-spacer',
    name: 'Flänsbussning / Precisionsdistans med Spår',
    description:
      'Maskinkomponent med bottenfläns, centrumhål, bultcirkel och fasade kanter för direkt export till Fusion 360 (.STEP).',
    category: 'Maskindelar',
    createdAt: '2026-11-06T01:12:00Z',
    parameters: [
      { key: 'flangeDia', label: 'Flänsdiameter', min: 30, max: 120, step: 1, defaultValue: 64, unit: 'mm' },
      { key: 'flangeThick', label: 'Flänstjocklek', min: 3, max: 20, step: 0.5, defaultValue: 7, unit: 'mm' },
      { key: 'hubDia', label: 'Navdiameter', min: 16, max: 80, step: 1, defaultValue: 36, unit: 'mm' },
      { key: 'totalHeight', label: 'Totalhöjd', min: 12, max: 80, step: 1, defaultValue: 30, unit: 'mm' },
      { key: 'boreDia', label: 'Centrumhål (Ø)', min: 6, max: 50, step: 0.5, defaultValue: 18, unit: 'mm' },
      { key: 'boltCount', label: 'Antal bulthål', min: 3, max: 8, step: 1, defaultValue: 4, unit: 'st' },
    ],
    code: `function buildModel(params, replicad) {
  const {
    flangeDia = 64,
    flangeThick = 7,
    hubDia = 36,
    totalHeight = 30,
    boreDia = 18,
    boltCount = 4,
  } = params;

  const flangeR = flangeDia / 2;
  const hubR = Math.min(hubDia / 2, flangeR - 4);
  const boreR = Math.min(boreDia / 2, hubR - 3);

  let part = makeCylinder(flangeR, flangeThick, [0, 0, 0], [0, 0, 1]);
  const hub = makeCylinder(hubR, totalHeight, [0, 0, 0], [0, 0, 1]);
  part = part.fuse(hub);

  // Centrumhål + kilspår (keyway)
  const centerBore = makeCylinder(boreR, totalHeight + 4, [0, 0, -2], [0, 0, 1]);
  const keyway = drawRectangle(4, boreR + 2.5)
    .translate(0, boreR / 2)
    .sketchOnPlane("XY", -1)
    .extrude(totalHeight + 2);

  part = part.cut(centerBore).cut(keyway);

  // Bultcirkel på flänsen
  const pitchR = (flangeR + hubR) / 2;
  const numBolts = Math.round(boltCount);
  for (let i = 0; i < numBolts; i++) {
    const angle = (i * 2 * Math.PI) / numBolts;
    const bx = Math.cos(angle) * pitchR;
    const by = Math.sin(angle) * pitchR;
    const boltHole = makeCylinder(2.6, flangeThick + 4, [bx, by, -2], [0, 0, 1]);
    part = part.cut(boltHole);
  }

  return {
    shape: part,
    name: "Flänsbussning",
    color: "#f59e0b",
  };
}`,
  },
];
