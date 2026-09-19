# Architecture and panel contract

## Heartbeat

`panels/heartbeat/on-init.js` initializes a `requestAnimationFrame` loop and the replay controls. A binary search selects the most recent sample at the playhead, provided it is at most 30 recorded seconds old. The image scale uses the original two-Gaussian pulse:

```text
phase = (wall_clock_seconds × BPM / 60) modulo 1
scale = 1 + 0.045 × exp(-((phase - 0.12)/0.07)²)
          + 0.019 × exp(-((phase - 0.32)/0.08)²)
```

Replay speed changes which recorded sample is selected. It does not multiply the displayed heartbeat rate. Pause, reduced motion, invalid rates, and missing signals return the image to scale 1. The artwork is illustrative, not an ECG or a live physiological measurement.

The builder reads the editable HTML/CSS/JavaScript and `data/heartbeat-demo.json`, asserts the synthetic marker, and embeds both the image and samples. No runtime asset server is needed.

## Data hall

The simulator writes a consistent transaction containing `racks`, `hall`, and the newest `hall_history` sample. Grafana retrieves the tables as data frames A, B, and C. The panel's `onRender` handler updates DOM text and CSS variables; CSS runs the cabinet activity and cooling animation between queries.

| Dataset | Required fields used by the panel |
| --- | --- |
| A: rack identity and status | `rack_id`, `row_id`, `position`, `status` |
| A: rack sensor values | `power_kw`, `capacity_kw`, `inlet_c`, `outlet_c`, `cpu_pct`, `memory_pct`, `network_gbps`, `fan_rpm` |
| A: rack inventory and timing | `servers`, `occupied_u`, `total_u`, `sampled_at_ms`, `last_seen_ms`, `synthetic` |
| B: hall identity and counts | `hall_id`, `rack_count`, `reporting`, `critical_count`, `warning_count`, `offline_count` |
| B: hall values | `it_power_kw`, `facility_power_kw`, `pue`, `avg_inlet_c`, `max_inlet_c`, `network_gbps`, `avg_cpu_pct`, `humidity_pct`, `cooling_kw` |
| B: timing | `sampled_at_ms`, `synthetic` |
| C: history | `sampled_at_ms`, `it_power_kw`, `avg_inlet_c`, `pue`, `network_gbps` |

Allowed rack statuses are `healthy`, `warning`, `critical`, and `offline`. The shipped layout has rows A–D and rack positions 01–06; changing the inventory requires updating the SVG layout generator. Numeric timestamps are Unix milliseconds. `synthetic=1` identifies the demo rows.

The 2-second sampler and 5-second dashboard refresh are separate from animation timing. The freshness display updates once a second. A hall sample older than 20 seconds, or a query failure after data has loaded, flags the feed as stale and pauses animation. Rack samples older than 30 seconds are treated as unavailable during rendering. Last-known hall numbers remain visible with their stale indication.

The offline example carries null sensor values while retaining rack inventory and its last-seen time. The independent hall meter includes that rack's simulated electrical load. Network and average sensor statistics are explicitly based on reporting racks.

## Panel lifecycle

Both panels clean up their frame loop or timer and their event listeners when unmounted. Re-initialization first invokes the previous cleanup. The data hall also preserves selection and metric coloring across query refreshes.

Motion controls do not change data-source polling. Both panels honor `prefers-reduced-motion`. Rack SVG groups are keyboard-accessible buttons, and Enter/Space selects a rack. On narrow layouts, rack selection brings the inspector into view.

The [HTML Graphics lifecycle references](https://gapit-htmlgraphics-panel.gapit.io/docs/references/) describe the `onInit`, `onRender`, data-frame access, and `panelwillunmount` interfaces used here.

## Portable installation

Generated exports contain no server credentials, absolute machine paths, or active databases. The installer receives the database path at runtime and uses an environment-provided token or a password prompt. It creates a read-only SQLite data source and the dashboards in a dedicated folder. It never changes Grafana authentication or sanitization settings.
