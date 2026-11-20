/**
 * Generates the SVG illustrations used in docs/visuals.
 * Run: bun run scripts/generate-visuals.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Candle = { o: number; h: number; l: number; c: number };
type Marker = { label: string; index: number; price: number; color: string };
type Level = { label: string; price: number; from: number; to: number; color: string; dash?: string };
type Zone = { low: number; high: number; from: number; color: string; label: string; sublabel?: string };
type ChartConfig = {
  file: string;
  title: string;
  subtitle: string;
  footer: string;
  candles: Candle[];
  zone: Zone;
  markers: Marker[];
  levels: Level[];
  arrow?: { fromIndex: number; fromPrice: number; toIndex: number; toPrice: number; color: string };
  badge?: { text: string; index: number; price: number; color: string };
};

const W = 1400;
const H = 800;
const PLOT = { left: 70, right: 1330, top: 120, bottom: 700 };

function candlesFromCloses(closes: number[], wickBase = 0.22): Candle[] {
  let previous = closes[0];
  return closes.map((close, index) => {
    const open = index === 0 ? close - 0.4 : previous;
    const wick = wickBase + (index % 4) * 0.08;
    const candle = {
      o: open,
      c: close,
      h: Math.max(open, close) + wick,
      l: Math.min(open, close) - wick,
    };
    previous = close;
    return candle;
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(config: ChartConfig): string {
  const all = config.candles.flatMap(candle => [candle.h, candle.l]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.12;
  const low = min - pad;
  const high = max + pad;
  const plotW = PLOT.right - PLOT.left;
  const plotH = PLOT.bottom - PLOT.top;
  const step = plotW / config.candles.length;
  const bodyW = Math.max(8, step * 0.55);

  const x = (index: number) => PLOT.left + step * index + step / 2;
  const y = (price: number) => PLOT.top + ((high - price) / (high - low)) * plotH;

  const grid = [];
  for (let i = 0; i <= 6; i++) {
    const gy = PLOT.top + (plotH / 6) * i;
    grid.push(`<line x1="${PLOT.left}" y1="${gy}" x2="${PLOT.right}" y2="${gy}" stroke="#3b82f6" stroke-opacity="0.12" />`);
  }
  for (let i = 0; i <= 8; i++) {
    const gx = PLOT.left + (plotW / 8) * i;
    grid.push(`<line x1="${gx}" y1="${PLOT.top}" x2="${gx}" y2="${PLOT.bottom}" stroke="#3b82f6" stroke-opacity="0.08" />`);
  }

  const candleSvg = config.candles.map((candle, index) => {
    const cx = x(index);
    const bullish = candle.c >= candle.o;
    const color = bullish ? "#2dd4bf" : "#fb7185";
    const top = y(Math.max(candle.o, candle.c));
    const bottom = y(Math.min(candle.o, candle.c));
    const bodyH = Math.max(2, bottom - top);
    return [
      `<line x1="${cx}" y1="${y(candle.h)}" x2="${cx}" y2="${y(candle.l)}" stroke="${color}" stroke-width="2" stroke-opacity="0.9" />`,
      `<rect x="${cx - bodyW / 2}" y="${top}" width="${bodyW}" height="${bodyH}" rx="2" fill="${color}" fill-opacity="${bullish ? "0.85" : "0.8"}" />`,
    ].join("");
  }).join("");

  const zoneX = x(config.zone.from);
  const zoneY = y(config.zone.high);
  const zoneH = Math.max(2, y(config.zone.low) - zoneY);
  const zoneFill = config.zone.color;
  const zoneSvg = [
    `<rect x="${zoneX}" y="${zoneY}" width="${PLOT.right - zoneX}" height="${zoneH}" rx="6" fill="${zoneFill}" fill-opacity="0.16" stroke="${zoneFill}" stroke-opacity="0.65" stroke-width="2" />`,
  ];

  const levelsSvg = config.levels.map(level => {
    const ly = y(level.price);
    return [
      `<line x1="${x(level.from)}" y1="${ly}" x2="${x(level.to)}" y2="${ly}" stroke="${level.color}" stroke-width="2" stroke-dasharray="${level.dash ?? "8 7"}" stroke-opacity="0.9" />`,
      `<rect x="${x(level.from) + 4}" y="${ly - 30}" width="${Math.max(70, level.label.length * 10 + 20)}" height="24" rx="12" fill="${level.color}" />`,
      `<text x="${x(level.from) + 14}" y="${ly - 13}" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#07111d">${escapeXml(level.label)}</text>`,
    ].join("");
  }).join("");

  const markersSvg = config.markers.map(marker => {
    const mx = x(marker.index);
    const my = y(marker.price);
    return [
      `<line x1="${mx}" y1="${my}" x2="${mx}" y2="${my - 34}" stroke="${marker.color}" stroke-width="2" stroke-opacity="0.8" />`,
      `<circle cx="${mx}" cy="${my}" r="9" fill="${marker.color}" stroke="#0b1220" stroke-width="3" />`,
      `<rect x="${mx - 19}" y="${my - 66}" width="38" height="26" rx="13" fill="${marker.color}" />`,
      `<text x="${mx}" y="${my - 48}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#07111d">${escapeXml(marker.label)}</text>`,
    ].join("");
  }).join("");

  let arrowSvg = "";
  if (config.arrow) {
    const ax1 = x(config.arrow.fromIndex);
    const ay1 = y(config.arrow.fromPrice);
    const ax2 = x(config.arrow.toIndex);
    const ay2 = y(config.arrow.toPrice);
    const cx = (ax1 + ax2) / 2;
    const cy = Math.min(ay1, ay2) - 42;
    arrowSvg = `<path d="M ${ax1} ${ay1} Q ${cx} ${cy} ${ax2} ${ay2}" fill="none" stroke="${config.arrow.color}" stroke-width="4" stroke-linecap="round" marker-end="url(#arrow-${config.arrow.color === '#fb7185' ? 'red' : config.arrow.color === '#60a5fa' ? 'blue' : config.arrow.color === '#fbbf24' ? 'amber' : 'teal'})" filter="url(#glow)" />`;
  }

  let badgeSvg = "";
  if (config.badge) {
    const bx = x(config.badge.index);
    const by = y(config.badge.price);
    const width = config.badge.text.length * 10 + 30;
    badgeSvg = [
      `<rect x="${bx - width / 2}" y="${by - 18}" width="${width}" height="34" rx="17" fill="${config.badge.color}" filter="url(#glow)" />`,
      `<text x="${bx}" y="${by + 5}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#07111d">${escapeXml(config.badge.text)}</text>`,
    ].join("");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(config.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#111b2e"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#2dd4bf"/>
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb7185"/>
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa"/>
    </marker>
    <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24"/>
    </marker>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${grid.join("")}

  <text x="70" y="66" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#e6f0ff">${escapeXml(config.title)}</text>
  <text x="70" y="96" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#8ea4bf">${escapeXml(config.subtitle)}</text>

  ${zoneSvg.join("")}
  ${candleSvg}
  ${levelsSvg}
  ${markersSvg}
  ${arrowSvg}
  ${badgeSvg}

  <line x1="${PLOT.left}" y1="${PLOT.bottom}" x2="${PLOT.right}" y2="${PLOT.bottom}" stroke="#2b3b4e" stroke-width="2" />
  <rect x="${PLOT.left}" y="${PLOT.bottom + 20}" width="14" height="14" rx="3" fill="${zoneFill}" fill-opacity="0.85" />
  <text x="${PLOT.left + 24}" y="${PLOT.bottom + 33}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#c7d7ea">POI · ${escapeXml(config.zone.label)} · ${escapeXml(config.zone.sublabel ?? 'Point of interest')}</text>
  <text x="${PLOT.left + 360}" y="${PLOT.bottom + 33}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#7f93aa">${escapeXml(config.footer)}</text>
  <text x="${PLOT.right}" y="${PLOT.bottom + 33}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#7f93aa">SMCshark · setup engine</text>
</svg>`;
}

const bullishCloses = [
  92, 93, 94, 93.4, 95, 96.2, 97, 98.2, 99.4, 100.6, 101.8, 102.6,
  101.9, 101.2, 100.4, 99.6, 99.2, 99.8, 100.6, 101.1, 100.4, 99.8,
  99.4, 99.1, 98.9, 99.3, 100.2, 101.4, 102.3, 103.2, 104.1, 105.0,
  105.9, 106.8, 107.6, 108.4, 109.2, 110.0, 110.8, 111.6, 112.4, 113.2,
];

const bearishCloses = [
  112, 111, 110, 110.6, 109, 107.8, 107, 105.8, 104.6, 103.4, 102.2, 101.4,
  102.1, 102.8, 103.6, 104.4, 104.8, 104.2, 103.4, 102.9, 103.6, 104.2,
  104.6, 104.9, 105.1, 104.7, 103.8, 102.6, 101.7, 100.8, 99.9, 99.0,
  98.1, 97.2, 96.4, 95.6, 94.8, 94.0, 93.2, 92.4, 91.6, 90.8,
];

const entryCloses = [
  92, 93, 94, 93.4, 95, 96.2, 97, 98.2, 99.4, 100.6, 101.8, 102.6,
  101.9, 101.2, 100.4, 99.8, 99.4, 99.9, 100.4, 100.8, 101.1, 100.7,
  100.2, 99.8, 99.5, 99.9, 100.6, 101.2, 101.8, 102.3, 102.8, 103.2,
  103.6, 104.0, 104.4, 104.8, 105.2, 105.6, 106.0, 106.4, 106.8, 107.2,
];

const invalidationCloses = [
  92, 93, 94, 93.4, 95, 96.2, 97, 98.2, 99.4, 100.6, 101.8, 102.6,
  101.9, 101.2, 100.4, 99.6, 99.2, 99.6, 100.1, 100.4, 99.9, 99.2,
  98.6, 97.8, 96.9, 96.1, 95.4, 94.8, 94.2, 93.6, 93.0, 92.4,
  91.8, 91.2, 90.6, 90.0, 89.4, 88.8, 88.2, 87.6, 87.0, 86.4,
];

const charts: ChartConfig[] = [
  {
    file: "bullish-setup.svg",
    title: "Bullish setup: 4H demand POI confirmed on 15M",
    subtitle: "Price enters the zone, internal BOS forms against it, then CHoCH confirms the reversal.",
    footer: "Demand zone · entry · BOS · CHoCH",
    candles: candlesFromCloses(bullishCloses),
    zone: { low: 98.9, high: 100.5, from: 7, color: "#60a5fa", label: "4H OB", sublabel: "Demand / POI" },
    markers: [
      { label: "T0", index: 7, price: 100.2, color: "#60a5fa" },
      { label: "T1", index: 17, price: 99.6, color: "#fbbf24" },
      { label: "T2", index: 24, price: 98.9, color: "#fb7185" },
      { label: "T3", index: 30, price: 102.3, color: "#2dd4bf" },
    ],
    levels: [
      { label: "BOS", price: 99.1, from: 18, to: 26, color: "#fb7185" },
      { label: "CHoCH", price: 102.2, from: 23, to: 31, color: "#2dd4bf" },
    ],
    arrow: { fromIndex: 32, fromPrice: 103.2, toIndex: 39, toPrice: 108.4, color: "#2dd4bf" },
  },
  {
    file: "bearish-setup.svg",
    title: "Bearish setup: 4H supply POI confirmed on 15M",
    subtitle: "Price rallies into supply, internal BOS forms above it, then CHoCH confirms the reversal down.",
    footer: "Supply zone · entry · BOS · CHoCH",
    candles: candlesFromCloses(bearishCloses),
    zone: { low: 99.5, high: 101.1, from: 7, color: "#fb7185", label: "4H OB", sublabel: "Supply / POI" },
    markers: [
      { label: "T0", index: 7, price: 99.8, color: "#fb7185" },
      { label: "T1", index: 17, price: 100.4, color: "#fbbf24" },
      { label: "T2", index: 24, price: 101.1, color: "#60a5fa" },
      { label: "T3", index: 30, price: 98.1, color: "#2dd4bf" },
    ],
    levels: [
      { label: "BOS", price: 100.9, from: 18, to: 26, color: "#60a5fa" },
      { label: "CHoCH", price: 97.9, from: 23, to: 31, color: "#2dd4bf" },
    ],
    arrow: { fromIndex: 32, fromPrice: 96.8, toIndex: 39, toPrice: 91.6, color: "#fb7185" },
  },
  {
    file: "zone-entry.svg",
    title: "Zone entry: price reached the 4H POI",
    subtitle: "The bot sends an entry notification here. No setup is confirmed until 15M BOS and CHoCH arrive.",
    footer: "Demand zone · entry · waiting for LTF confirmation",
    candles: candlesFromCloses(entryCloses),
    zone: { low: 98.9, high: 100.5, from: 7, color: "#60a5fa", label: "4H OB", sublabel: "Demand / POI" },
    markers: [
      { label: "T1", index: 18, price: 99.8, color: "#fbbf24" },
    ],
    levels: [],
    badge: { text: "WAIT FOR 15M CONFIRMATION", index: 30, price: 102.0, color: "#fbbf24" },
  },
  {
    file: "invalidation.svg",
    title: "Invalidation: price broke through the 4H POI",
    subtitle: "A close through the zone low cancels the setup. The bot sends one invalidation message.",
    footer: "Demand zone · breakdown · setup invalidated",
    candles: candlesFromCloses(invalidationCloses),
    zone: { low: 98.9, high: 100.5, from: 7, color: "#60a5fa", label: "4H OB", sublabel: "Demand / POI" },
    markers: [
      { label: "T1", index: 18, price: 99.9, color: "#fbbf24" },
    ],
    levels: [
      { label: "ZONE LOW", price: 98.9, from: 21, to: 30, color: "#fb7185" },
    ],
    badge: { text: "INVALIDATED", index: 27, price: 97.4, color: "#fb7185" },
    arrow: { fromIndex: 28, fromPrice: 96.8, toIndex: 35, toPrice: 91.0, color: "#fb7185" },
  },
];

const outputDir = join(process.cwd(), "docs", "visuals");
mkdirSync(outputDir, { recursive: true });

for (const chart of charts) {
  const path = join(outputDir, chart.file);
  writeFileSync(path, render(chart), "utf8");
  console.log(`wrote ${path}`);
}
