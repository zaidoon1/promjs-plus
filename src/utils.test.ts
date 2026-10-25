import { describe, expect, it } from "vitest";
import { formatCounterOrGauge, formatHistogramOrSummary } from "./utils";

describe("utils", () => {
  it("formats a counter/gauge metric", () => {
    const simple = { value: 2 };
    const complex = {
      labels: { ok: "true", status: "success", code: 200 },
      value: 1,
    };

    expect(formatCounterOrGauge("my_counter", simple)).equals("my_counter 2\n");
    expect(formatCounterOrGauge("my_counter", complex)).equals(
      'my_counter{ok="true",status="success",code="200"} 1\n',
    );
  });

  it("formats a histogram metric", () => {
    // Raw bucket counts: 200: 0, 300: 2, 400: 0, 500: 0, +Inf: 0
    // Cumulative output: 200: 0, 300: 2, 400: 2, 500: 2, +Inf: 2
    let desired = "";
    desired += "my_histogram_count 2\n";
    desired += "my_histogram_sum 501\n";
    desired += 'my_histogram_bucket{le="200"} 0\n';
    desired += 'my_histogram_bucket{le="300"} 2\n';
    desired += 'my_histogram_bucket{le="400"} 2\n';
    desired += 'my_histogram_bucket{le="500"} 2\n';
    desired += 'my_histogram_bucket{le="+Inf"} 2\n';
    const bucketKeys = ["200", "300", "400", "500"];
    const simple = {
      value: {
        sum: 501,
        count: 2,
        entries: { 200: 0, 300: 2, 400: 0, 500: 0, "+Inf": 0 },
      },
    };
    const complex = {
      ...simple,
      labels: { instance: "some_instance", ok: "true" },
    };
    expect(formatHistogramOrSummary("my_histogram", simple, bucketKeys)).equals(
      desired,
    );

    desired = 'my_histogram_count{instance="some_instance",ok="true"} 2\n';
    desired += 'my_histogram_sum{instance="some_instance",ok="true"} 501\n';
    desired +=
      'my_histogram_bucket{le="200",instance="some_instance",ok="true"} 0\n';
    desired +=
      'my_histogram_bucket{le="300",instance="some_instance",ok="true"} 2\n';
    desired +=
      'my_histogram_bucket{le="400",instance="some_instance",ok="true"} 2\n';
    desired +=
      'my_histogram_bucket{le="500",instance="some_instance",ok="true"} 2\n';
    desired +=
      'my_histogram_bucket{le="+Inf",instance="some_instance",ok="true"} 2\n';

    expect(formatHistogramOrSummary("my_histogram", complex, bucketKeys)).equals(
      desired,
    );
  });
});
