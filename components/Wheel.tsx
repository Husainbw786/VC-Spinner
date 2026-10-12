"use client";

// Segment paint. The wheel is a physical object, so it keeps the same colors in light and dark mode.
export const WHEEL_COLORS = [
  { fill: "#0B6E74", text: "#FFFFFF" }, // peacock
  { fill: "#F2A51A", text: "#1B1405" }, // marigold
  { fill: "#C8326B", text: "#FFFFFF" }, // rani pink
  { fill: "#2B3A8F", text: "#FFFFFF" }, // indigo
  { fill: "#3D8B37", text: "#FFFFFF" }, // leaf
  { fill: "#E26A2C", text: "#FFFFFF" }, // saffron
  { fill: "#6B3A7D", text: "#FFFFFF" }, // plum
  { fill: "#1F8FB8", text: "#FFFFFF" }, // sky
];

const RIM = "#102A2E";
const R = 90;
const BULBS = 24;

function point(angle: number, r: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

// Angles are degrees clockwise from 12 o'clock, where the pointer sits.
function slicePath(from: number, to: number): string {
  const [x1, y1] = point(from, R);
  const [x2, y2] = point(to, R);
  const large = to - from > 180 ? 1 : 0;
  return `M0 0L${x1.toFixed(3)} ${y1.toFixed(3)}A${R} ${R} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}Z`;
}

function paint(i: number, n: number) {
  // Avoid the last slice matching the first one it touches.
  if (n > 1 && i === n - 1 && i % WHEEL_COLORS.length === 0) return WHEEL_COLORS[2];
  return WHEEL_COLORS[i % WHEEL_COLORS.length];
}

type Props = {
  /** One entry per slice. A person with two shares left has two entries. */
  slots: { key: string; name: string }[];
  rotation: number;
  durationMs: number;
  symbol: string;
  dimmed?: boolean;
  onSpinEnd?: () => void;
};

// Room for a label between the hub and the rim, in wheel units.
const LABEL_ROOM = 64;

function labelFor(name: string, n: number) {
  const base = n <= 6 ? 9 : n <= 10 ? 7.5 : n <= 16 ? 6.2 : 5;
  const text = name.length > 24 ? `${name.slice(0, 23)}…` : name;
  // Shrink long names so they fit instead of being cut off.
  return { text, size: Math.max(4, Math.min(base, LABEL_ROOM / (text.length * 0.56))) };
}

export default function Wheel({ slots, rotation, durationMs, symbol, dimmed, onSpinEnd }: Props) {
  const n = slots.length;
  const seg = n ? 360 / n : 360;

  return (
    <div className="wheel" data-dimmed={dimmed || undefined}>
      <svg className="wheel-pointer" viewBox="0 0 40 52" aria-hidden="true">
        <path d="M20 50L4 18A17 17 0 1 1 36 18Z" fill="#F2A51A" stroke={RIM} strokeWidth="3" strokeLinejoin="round" />
        <circle cx="20" cy="17" r="6" fill={RIM} />
      </svg>
      <div
        className="wheel-rotor"
        style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${durationMs}ms` }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) onSpinEnd?.();
        }}
      >
        <svg viewBox="-100 -100 200 200" role="img" aria-label={`Wheel with ${n} ${n === 1 ? "slice" : "slices"}: ${slots.map((m) => m.name).join(", ")}`}>
          <circle r="99" fill={RIM} />
          {n <= 1 ? (
            <circle r={R} fill={WHEEL_COLORS[0].fill} />
          ) : (
            slots.map((m, i) => (
              <path key={m.key} d={slicePath(i * seg, (i + 1) * seg)} fill={paint(i, n).fill} stroke={RIM} strokeWidth="0.6" />
            ))
          )}
          {slots.map((m, i) => {
            const center = i * seg + seg / 2;
            const label = labelFor(m.name, n);
            return (
              <text
                key={m.key}
                transform={`rotate(${center - 90}) translate(${R - 7} 0)`}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={label.size.toFixed(2)}
                fontWeight={600}
                fill={n <= 1 ? WHEEL_COLORS[0].text : paint(i, n).text}
                style={{ fontFamily: "var(--font-body)" }}
              >
                {label.text}
              </text>
            );
          })}
          {Array.from({ length: BULBS }, (_, k) => {
            const [x, y] = point((k / BULBS) * 360, 95);
            return <circle key={k} className={k % 2 ? "bulb bulb-odd" : "bulb"} cx={x.toFixed(3)} cy={y.toFixed(3)} r="1.7" fill="#F8C95A" />;
          })}
          <circle r="15" fill={RIM} stroke="#F2A51A" strokeWidth="2.2" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight={700} fill="#F2A51A" style={{ fontFamily: "var(--font-body)" }}>
            {symbol}
          </text>
        </svg>
      </div>
    </div>
  );
}
