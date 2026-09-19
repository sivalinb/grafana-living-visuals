# Validation record

The original running dashboards were exercised in Grafana 12.1.1 with HTML Graphics 2.2.3 and SQLite data source 4.0.6.

## Observed in Grafana

| Area | Verified behavior |
| --- | --- |
| Heart animation | Image transform changed across animation frames and followed the displayed fictional BPM |
| Heart controls | Pause returned to scale 1; workout selection changed duration and readings; reduced motion stopped the pulse |
| Heart signal gap | BPM became unavailable, the image dimmed, and the pulse stopped |
| Data hall queries | Query A returned 24 racks, B returned one hall, and C returned chronological live history |
| Data refresh | Hall and rack readings changed while Grafana refreshed every five seconds |
| Rack interaction | Selection opened the corresponding inspector; temperature, power, and CPU modes changed cabinet labels and coloring |
| Offline rack | D02 displayed null sensor values and its LED animation was disabled |
| Motion control | Activity animation paused and resumed while measurement refresh continued |
| Feed interruption | Pausing the task-owned simulator for 35 seconds produced a stale warning and paused LEDs; fresh readings and animation recovered after the simulator resumed |
| Browser checks | No panel JavaScript errors were observed; compact layout, rack labels, and inspector were visually checked |

## Reproducible checks

Run the commands in the README. The Python checks cover synthetic fixture integrity, unique rack identities, missing-value semantics, aggregate meter/PUE consistency, database retention, timestamp units, and agreement between editable sources and dashboard exports. Node checks JavaScript syntax.

The packaging tools use only Python's standard library. The portable installer can be inspected without contacting Grafana:

```sh
python3 scripts/install_dashboards.py --db "$PWD/runtime/telemetry.sqlite" --dry-run
```

The original API installation and running panels were verified. A fresh Grafana deployment using the newly packaged installer was not provisioned during packaging. Real equipment connections, multiple halls, large rack counts, alert routing, and Grafana Cloud deployment are outside this demo's verified scope.
