import { beforeEach, describe, expect, it } from "vitest";
import { Collector } from "./collector";
import { Counter } from "./counter";
import { Registry } from "./registry";
import { PROMETHEUS_CONTENT_TYPE, OPENMETRICS_CONTENT_TYPE } from "./index";

describe("Registry", () => {
  let registry: Registry;
  let counter: Counter;

  beforeEach(() => {
    registry = new Registry();
    counter = registry.create("counter", "my_counter", "A counter for things");
  });

  it("renders metrics to prometheus format", () => {
    let desired = "# HELP my_counter A counter for things\n";
    desired += "# TYPE my_counter counter\n";
    desired += "my_counter 5\n";

    counter.add(5);
    expect(registry.metrics()).equals(desired);
  });

  it("renders metrics with labels to prometheus format", () => {
    let desired = "# HELP my_counter A counter for things\n";
    desired += "# TYPE my_counter counter\n";
    desired += 'my_counter{path="/org/:orgId",foo="bar"} 10\n';

    counter.add(10, { path: "/org/:orgId", foo: "bar" });
    expect(registry.metrics()).equals(desired);
  });

  it("renders fractional histogram buckets in ascending order with cumulative counts", () => {
    const reg = new Registry();
    const h = reg.create("histogram", "latency", "", [0.1, 0.5, 1, 2.5, 10]);
    for (const value of [0.0625, 0.25, 0.75, 2, 5, 20]) {
      h.observe(value);
    }

    let desired = "# TYPE latency histogram\n";
    desired += "latency_count 6\n";
    desired += "latency_sum 28.0625\n";
    desired += 'latency_bucket{le="0.1"} 1\n';
    desired += 'latency_bucket{le="0.5"} 2\n';
    desired += 'latency_bucket{le="1"} 3\n';
    desired += 'latency_bucket{le="2.5"} 4\n';
    desired += 'latency_bucket{le="10"} 5\n';
    desired += 'latency_bucket{le="+Inf"} 6\n';
    expect(reg.metrics()).equals(desired);

    // counts observed after a scrape show up in the next one
    h.observe(0.3);
    expect(reg.metrics()).contains('latency_bucket{le="0.5"} 3\n');
    expect(reg.metrics()).contains('latency_bucket{le="+Inf"} 7\n');

    // and a reset series comes out in the same order
    reg.reset();
    h.observe(2, { path: "/a" });
    let labelled = 'latency_count{path="/a"} 1\n';
    labelled += 'latency_sum{path="/a"} 2\n';
    labelled += 'latency_bucket{le="0.1",path="/a"} 0\n';
    labelled += 'latency_bucket{le="0.5",path="/a"} 0\n';
    labelled += 'latency_bucket{le="1",path="/a"} 0\n';
    labelled += 'latency_bucket{le="2.5",path="/a"} 1\n';
    labelled += 'latency_bucket{le="10",path="/a"} 1\n';
    labelled += 'latency_bucket{le="+Inf",path="/a"} 1\n';
    expect(reg.metrics()).contains(labelled);
  });

  it("treats an Infinity bound as the implicit +Inf bucket", () => {
    const reg = new Registry();
    const h = reg.create("histogram", "latency", "", [0.1, 1, Infinity]);
    for (const value of [0.05, 0.5, 5]) {
      h.observe(value);
    }

    let desired = "# TYPE latency histogram\n";
    desired += "latency_count 3\n";
    desired += "latency_sum 5.55\n";
    desired += 'latency_bucket{le="0.1"} 1\n';
    desired += 'latency_bucket{le="1"} 2\n';
    desired += 'latency_bucket{le="+Inf"} 3\n';
    expect(reg.metrics()).equals(desired);
  });

  it("renders a repeated bound once", () => {
    const reg = new Registry();
    const h = reg.create("histogram", "latency", "", [1, 0.5, 1]);
    h.observe(0.75);

    let desired = "# TYPE latency histogram\n";
    desired += "latency_count 1\n";
    desired += "latency_sum 0.75\n";
    desired += 'latency_bucket{le="0.5"} 0\n';
    desired += 'latency_bucket{le="1"} 1\n';
    desired += 'latency_bucket{le="+Inf"} 1\n';
    expect(reg.metrics()).equals(desired);
  });

  it("clear all the metrics", () => {
    counter.inc();
    registry.clear();
    expect(registry.metrics()).equals("");
  });

  it("reset all the metrics", () => {
    counter.inc();
    registry.reset();
    expect(registry.metrics()).contains("my_counter 0");
    counter.inc();
    expect(registry.metrics()).contains("my_counter 1");
  });

  it("gets a metric by name and type", () => {
    const metric = registry.get("counter", "my_counter");
    expect(metric).instanceof(Collector);
  });

  it("prevents naming collisions", () => {
    const dupe = (): void => {
      registry.create("counter", "counter_a");
      registry.create("counter", "counter_a");
    };
    expect(dupe).throw();
  });

  describe("default labels", () => {
    it("applies default labels via constructor", () => {
      const reg = new Registry({ defaultLabels: { env: "prod", region: "us" } });
      const c = reg.create("counter", "requests", "");
      c.inc();
      expect(reg.metrics()).contains('requests{env="prod",region="us"} 1');
    });

    it("applies default labels via setDefaultLabels", () => {
      const reg = new Registry();
      reg.setDefaultLabels({ service: "api" });
      const c = reg.create("counter", "requests", "");
      c.inc();
      expect(reg.metrics()).contains('requests{service="api"} 1');
    });

    it("metric labels override default labels", () => {
      const reg = new Registry({ defaultLabels: { env: "prod" } });
      const c = reg.create("counter", "requests", "");
      c.inc({ env: "staging", path: "/" });
      // metric's env="staging" overrides default env="prod"
      expect(reg.metrics()).contains('requests{env="staging",path="/"} 1');
    });

    it("returns default labels via getDefaultLabels", () => {
      const reg = new Registry({ defaultLabels: { foo: "bar" } });
      expect(reg.getDefaultLabels()).deep.equals({ foo: "bar" });
    });

    it("applies default labels to histograms", () => {
      const reg = new Registry({ defaultLabels: { env: "test" } });
      const h = reg.create("histogram", "latency", "", [100, 500]);
      h.observe(50);
      const output = reg.metrics();
      expect(output).contains('latency_count{env="test"} 1');
      expect(output).contains('latency_sum{env="test"} 50');
      expect(output).contains('latency_bucket{le="100",env="test"} 1');
    });
  });

  describe("output format", () => {
    it("defaults to prometheus format (no EOF)", () => {
      const output = registry.metrics();
      expect(output).not.contains("# EOF");
    });

    it("prometheus format explicitly (no EOF)", () => {
      counter.inc();
      const output = registry.metrics({ format: "prometheus" });
      expect(output).not.contains("# EOF");
      expect(output).contains("my_counter 1");
    });

    it("openmetrics format appends EOF", () => {
      counter.inc();
      const output = registry.metrics({ format: "openmetrics" });
      expect(output).contains("my_counter 1");
      expect(output.endsWith("# EOF\n")).equals(true);
    });

    it("openmetrics and prometheus output identical except EOF", () => {
      counter.add(5);
      const prom = registry.metrics({ format: "prometheus" });
      const om = registry.metrics({ format: "openmetrics" });
      expect(om).equals(`${prom}# EOF\n`);
    });

    it("exports content type constants", () => {
      expect(PROMETHEUS_CONTENT_TYPE).equals("text/plain; version=0.0.4");
      expect(OPENMETRICS_CONTENT_TYPE).equals("application/openmetrics-text; version=1.0.0");
    });
  });
});
