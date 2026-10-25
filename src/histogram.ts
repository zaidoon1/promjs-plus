import { Collector } from "./collector";
import { HistogramValue, HistogramValueEntries, Labels } from "./types";

function getInitialValue(bucketKeys: readonly string[]): HistogramValue {
  // Key order doesn't matter: buckets are exported in bucketKeys order
  const entries: HistogramValueEntries = { "+Inf": 0 };
  for (const key of bucketKeys) {
    entries[key] = 0;
  }
  return { entries, sum: 0, count: 0 };
}

export class Histogram extends Collector<HistogramValue> {
  private readonly buckets: number[];
  // Keys of the finite bounds, smallest first: the order buckets are exported
  // in. "+Inf" is always there and always last, so it isn't listed.
  readonly bucketKeys: readonly string[];

  constructor(buckets: number[] = []) {
    super();
    // Sort smallest to largest, drop repeats and an explicit +Inf,
    // pre-compute string keys
    this.buckets = [...new Set(buckets)]
      .filter((bound) => bound !== Infinity)
      .sort((a, b) => a - b);
    this.bucketKeys = this.buckets.map(String);
    this.set(getInitialValue(this.bucketKeys));
    this.observe = this.observe.bind(this);
  }

  observe(value: number, labels?: Labels): this {
    const metric = this.get(labels) ?? this.set(getInitialValue(this.bucketKeys), labels);

    // Find the bucket this value falls into and increment only that bucket
    // Store raw (non-cumulative) counts; cumulative is computed at export
    let bucketKey = "+Inf";
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        bucketKey = this.bucketKeys[i];
        break;
      }
    }
    metric.value.entries[bucketKey] += 1;

    metric.value.sum += value;
    metric.value.count += 1;

    return this;
  }

  reset(labels?: Labels): void {
    this.set(getInitialValue(this.bucketKeys), labels);
  }
}
