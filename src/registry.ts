import { Collector } from "./collector";
import { Counter } from "./counter";
import { Gauge } from "./gauge";
import { Histogram } from "./histogram";
import {
  CollectorType,
  CounterValue,
  HistogramValue,
  Labels,
  Metric,
  MetricFormat,
  MetricValue,
} from "./types";

import { formatCounterOrGauge, formatHistogramOrSummary } from "./utils";

type CollectorForType<T extends CollectorType> = T extends "histogram"
  ? Histogram
  : T extends "gauge"
  ? Gauge
  : T extends "counter"
  ? Counter
  : never;

type RegistryItem<T extends CollectorType> = Record<string, {
    type: T;
    help: string;
    instance: CollectorForType<T>;
  }>;

export interface RegistryOptions {
  defaultLabels?: Labels;
}

export interface MetricsOptions {
  format?: MetricFormat;
}

export class Registry {
  private data: {
    [K in CollectorType]: RegistryItem<K>;
  };
  private _defaultLabels: Labels;

  constructor(options: RegistryOptions = {}) {
    this.data = {
      counter: {},
      gauge: {},
      histogram: {},
    };
    this._defaultLabels = options.defaultLabels ?? {};
  }

  setDefaultLabels(labels: Labels): this {
    this._defaultLabels = labels;
    return this;
  }

  getDefaultLabels(): Labels {
    return { ...this._defaultLabels };
  }

  private validateInput(
    type: CollectorType,
    name: string,
    help?: string,
    buckets?: number[],
  ): void {
    // checks for js runtime
    if (String(name) === "") {
      throw new Error("Metric name cannot be empty");
    }
    if (["counter", "gauge", "histogram"].indexOf(type) === -1) {
      throw new Error(`Unknown metric type ${type}`);
    }

    if (typeof help !== "string" && help != null) {
      throw new Error("help must be string or undefined/null");
    }

    if (this.data[type][name]) {
      throw new Error(
        `A metric with the name '${name}' already exists for type '${type}'`,
      );
    }

    if (!Array.isArray(buckets) && buckets != null) {
      throw new Error("buckets must be array or undefined/null");
    }
  }

  create(type: "counter", name: string, help?: string): Counter;

  create(type: "gauge", name: string, help?: string): Gauge;

  create(
    type: "histogram",
    name: string,
    help?: string,
    histogramBuckets?: number[],
  ): Histogram;

  create(
    type: CollectorType,
    name: string,
    help = "",
    histogramBuckets: number[] = [],
  ): Collector<MetricValue> {
    this.validateInput(type, name, help, histogramBuckets);

    let instance;
    if (type === "counter") {
      instance = new Counter();
      this.data.counter[name] = { help, instance, type };
    } else if (type === "gauge") {
      instance = new Gauge();
      this.data.gauge[name] = { help, instance, type };
    } else {
      instance = new Histogram(histogramBuckets);
      this.data.histogram[name] = { help, instance, type };
    }

    return instance;
  }

  metrics(options: MetricsOptions = {}): string {
    const { format = 'prometheus' } = options;
    const output = Object.entries(this.data).reduce(
      (out, [type, metrics]) =>
        out +
        Object.entries(metrics).reduce((src, [name, metric]) => {
          const values = metric.instance.collect();
          let result = src;
          if (metric.help.length > 0) {
            result += `# HELP ${name} ${metric.help}\n`;
          }
          result += `# TYPE ${name} ${type}\n`;
          result += values.reduce((str: string, value: Metric<MetricValue>) => {
            const formatted =
              type === "histogram"
                ? formatHistogramOrSummary(
                    name,
                    value as Metric<HistogramValue>,
                    (metric.instance as Histogram).bucketKeys,
                    "le",
                    this._defaultLabels,
                  )
                : formatCounterOrGauge(name, value as Metric<CounterValue>, this._defaultLabels);
            return str + formatted;
          }, "");
          return result;
        }, ""),
      "",
    );
    return format === 'openmetrics' ? `${output}# EOF\n` : output;
  }

  reset(): this {
    Object.values(this.data).map((m) =>
      Object.values(m).map(({ instance }) => instance.resetAll()),
    );
    return this;
  }

  clear(): this {
    this.data = {
      counter: {},
      gauge: {},
      histogram: {},
    };

    return this;
  }

  get(type: "counter", name: string): Counter | undefined;

  get(type: "gauge", name: string): Gauge | undefined;

  get(type: "histogram", name: string): Histogram | undefined;

  get(type: CollectorType, name: string): Collector<MetricValue> | undefined {
    const registryItems =
      type != null ? [this.data[type]] : Object.values(this.data);
    const metric = registryItems.find((v) => name in v);

    return metric != null ? metric[name].instance : undefined;
  }
}
