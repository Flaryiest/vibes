import { useId } from "react";
import { rollingMedian } from "../practice/pitchCheck";

/** Room on each side for the first and last values to be written out. */
const GUTTER = 44;
const PAD = 9;
/** With only a few values the dots sit this far apart, and the chart fills in from the left. */
const MAX_STEP = 44;

type Props = {
  /** One dot each, oldest first. */
  values: number[];
  /** The vertical scale: `min` sits on the baseline and `max` at the top. Values outside are drawn at the edge. */
  min: number;
  max: number;
  /** What the chart shows, for screen readers and on hover. */
  title: string;
  /** The same story in words, for screen readers. */
  desc: string;
  /** How many values each point of the line takes the median of. */
  window?: number;
  /** How the first and last values are written. */
  format?: (value: number) => string;
  /** A name for each value, shown when the pointer rests on its dot. */
  labels?: string[];
  width?: number;
  height?: number;
};

/**
 * A small trend chart: a faint dot for each value and a line for their rolling
 * median, so one odd result does not read as a change of direction. Only the
 * first and last values are written out.
 */
export function Sparkline({
  values,
  min,
  max,
  title,
  desc,
  window = 3,
  format = (value) => String(Math.round(value)),
  labels,
  width = 360,
  height = 72,
}: Props) {
  const id = useId();
  if (values.length === 0) return null;

  const last = values.length - 1;
  const step = last === 0 ? 0 : Math.min(MAX_STEP, (width - 2 * GUTTER) / last);
  const x = (i: number) => GUTTER + i * step;
  const y = (value: number) => {
    const share = max > min ? (value - min) / (max - min) : 0.5;
    return height - PAD - Math.min(1, Math.max(0, share)) * (height - 2 * PAD);
  };
  const line = rollingMedian(values, window)
    .map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block h-auto max-w-full"
    >
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{desc}</desc>
      <line
        x1={GUTTER}
        x2={width - GUTTER}
        y1={height - PAD + 0.5}
        y2={height - PAD + 0.5}
        strokeWidth={1}
        className="stroke-rule"
      />
      {values.map((value, i) => (
        <g key={i}>
          {labels?.[i] && <title>{labels[i]}</title>}
          {/* A wider target than the dot itself, so the name is easy to bring up. */}
          <circle cx={x(i)} cy={y(value)} r={9} fill="transparent" />
          <circle cx={x(i)} cy={y(value)} r={2.5} className="fill-mist" opacity={i === last ? 1 : 0.55} />
        </g>
      ))}
      {last > 0 && (
        <polyline
          points={line}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
          className="stroke-chalk"
        />
      )}
      {last > 0 && (
        <text x={x(0) - 9} y={y(values[0])} textAnchor="end" dominantBaseline="central" className="fill-mist text-xs tabular-nums">
          {format(values[0])}
        </text>
      )}
      <text x={x(last) + 9} y={y(values[last])} dominantBaseline="central" className="fill-chalk text-xs tabular-nums">
        {format(values[last])}
      </text>
    </svg>
  );
}
