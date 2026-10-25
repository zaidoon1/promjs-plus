import { HistogramValue, Labels, Metric, MetricValue } from "./types";

function getLabelPairs(
  metric: Metric<MetricValue>,
  defaultLabels: Labels = {},
): string {
  // Metric labels override default labels
  const merged = { ...defaultLabels, ...metric.labels };
  const pairs = Object.entries(merged).map(([k, v]) => `${k}="${v}"`);
  return pairs.length === 0 ? "" : `${pairs.join(",")}`;
}

export function formatHistogramOrSummary(
  name: string,
  metric: Metric<HistogramValue>,
  bucketKeys: readonly string[],
  bucketLabel = "le",
  defaultLabels: Labels = {},
): string {
  let str = "";
  const labels = getLabelPairs(metric, defaultLabels);
  if (labels.length > 0) {
    str += `${name}_count{${labels}} ${metric.value.count}\n`;
    str += `${name}_sum{${labels}} ${metric.value.sum}\n`;
  } else {
    str += `${name}_count ${metric.value.count}\n`;
    str += `${name}_sum ${metric.value.sum}\n`;
  }

  // Compute cumulative counts from raw bucket counts, smallest bound first.
  // Walk bucketKeys rather than the entries object: JS lists integer-like keys
  // ("1", "10") ahead of all others, so "0.5" and "+Inf" would come after "10".
  // +Inf holds every observation, so its cumulative count is _count.
  const { entries } = metric.value;
  const labelSuffix = labels.length > 0 ? `,${labels}` : "";
  let cumulative = 0;
  for (const bucket of bucketKeys) {
    cumulative += entries[bucket];
    str += `${name}_bucket{${bucketLabel}="${bucket}"${labelSuffix}} ${cumulative}\n`;
  }
  str += `${name}_bucket{${bucketLabel}="+Inf"${labelSuffix}} ${metric.value.count}\n`;

  return str;
}

export function findExistingMetric<T extends MetricValue>(
  labels: Labels,
  values: Metric<T>[],
): Metric<T> | undefined {
  return values.find((v) => {
    if (!v.labels) {
      return false;
    }
    if (Object.keys(v.labels).length !== Object.keys(labels).length) {
      return false;
    }
    for (const [label, value] of Object.entries(labels)) {
      if (v.labels[label] !== value) {
        return false;
      }
    }
    return true;
  });
}

export function formatCounterOrGauge(
  name: string,
  metric: Metric<MetricValue>,
  defaultLabels: Labels = {},
): string {
  const value = ` ${metric.value.toString()}`;
  const labels = getLabelPairs(metric, defaultLabels);
  if (labels.length === 0) {
    return `${name}${value}\n`;
  }
  return `${name}{${labels}}${value}\n`;
}
