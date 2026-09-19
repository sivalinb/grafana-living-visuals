# AI infrastructure visuals

Three linked Grafana dashboards use one synthetic telemetry model. The original heartbeat and 24-rack data hall remain separate examples; the new four-rack AI cluster is not an additional set of rows in the original hall database.

| Dashboard UID | Scope | Default selection |
| --- | --- | --- |
| `living-ai-rack` | Rack AI-R01, eight servers and 64 GPUs | Server AI-R01-N03, GPU 6 |
| `living-gpu-cluster` | Cluster AURORA-01, four racks, 32 servers and 256 GPUs | AI-R01 / N03 |
| `living-server-chassis` | Server AI-R01-N03 | Failed fan F04 |

## Ingestion and queries

The Python standard-library simulator writes every two seconds. Its default database is `runtime/ai-telemetry.sqlite`; `--db` and `--interval` can override the path and interval. One transaction writes all current tables plus three history rows, then prunes history older than 900 seconds. WAL permits readers alongside the writer. The portable installer configures data-source UID `living-ai-infrastructure-sim` with `mode=ro` and `attachLimit=0`.

All measurements are generated from time-based functions. No BMC, physical GPU, network switch, job scheduler, or remote monitoring API is queried. The sampler stamps current rows with `sampled_at_ms` in Unix milliseconds and `synthetic=1`. History uses the same timestamp but belongs to this explicitly synthetic database rather than carrying a separate marker per row.

| Frame | AI rack | GPU cluster | Chassis |
| --- | --- | --- | --- |
| A | `ai_meta` | `ai_meta` | `ai_meta` |
| B | `ai_racks` filtered to AI-R01 | All `ai_racks` | N03 `ai_components` |
| C | AI-R01 `ai_nodes` | All `ai_nodes` | N03 `ai_gpus` |
| D | AI-R01 `ai_gpus` | All `ai_gpus` | N03 `ai_fans` |
| E | — | All `ai_links` | N03 `ai_nodes` |
| F | — | All `ai_jobs` | — |
| H | `ai_history`, scope `rack` | `ai_history`, scope `cluster` | `ai_history`, scope `chassis` |

Each dashboard contains its SQL in `panels/<view>/dashboard.template.json`. Queries return tables; `timeColumns` stays empty so timestamps remain milliseconds. All required frames must be present before replacing the last complete rendered snapshot. Grafana polls every five seconds; the panel reads frame values in `onRender` through `htmlNode.__aiUpdate`.

## Inventory, quantities and aggregation

- Rack IDs AI-R01–AI-R04 each contain nodes N01–N08. Each node has GPUs G0–G7 with 80 GB of HBM each. This is generic illustrative inventory with no GPU model or performance guarantee.
- The rack drawing represents eight 4U accelerator servers, two fabric switches, dual power paths and unused cabinet space in a 42U enclosure. The visual is conceptual, not a manufacturing drawing.
- GPU utilization and HBM use stay within 0–100% and 0–80 GB respectively. GPU temperatures, electrical power and local-fabric rates vary with the generated load.
- Each node's power totals its GPU draws plus simulated platform overhead. Rack power is the sum of its eight nodes plus 1.2 kW. Cluster IT power sums the four rack meters. This is IT power, not facility power or PUE.
- Each node has two illustrative 200 Gb/s NICs. Each rack has two 1,600 Gb/s uplinks, one to each spine. The simulator splits rack traffic across these links; their rates sum to the rack endpoint rate. The cluster endpoint total sums server traffic once, rather than adding NIC and uplink rates together.
- CPU/component powers are illustrative subcomponents; they do not exhaustively account for all node overhead. DDR banks are static inventory. Local GPU-fabric rates are separate from external NIC traffic.
- Aurora training occupies racks 1–3 (192 GPUs); Atlas inference occupies rack 4 (64 GPUs). Token rates and a looping training-progress indicator are simulated workload context, not benchmark results.

## Chassis topology and fan fault

Mint paths connect each CPU root to a PCIe switch. Each switch fans out to four GPU endpoints and one fabric NIC. Violet paths represent the inter-CPU fabric and NIC connections to the cluster fabric. Dotted amber paths represent the BMC's sideband management and fan tachometer/control relationships. The BMC is not on the bulk PCIe/GPU traffic path. The diagram deliberately avoids claims about a specific platform's lane routing, generations or management bus protocol.

The chassis always injects one fan fault:

| Fan property | F04 | Other five fans |
| --- | --- | --- |
| `status` | `failed` | `running` |
| `rpm` | Exactly 0 | Changing positive tachometer reading |
| `target_rpm` | Positive BMC speed target | Positive BMC speed target |
| Rendered rotor | No rotation animation | Rotation period derived from RPM |

This is a synthetic measured zero, not a null or unknown value. The controller remains `online`. N03 is `degraded` with 5/6 fans; AI-R01 has 47/48 fans; the cluster reports one failed fan. GPU 5 and GPU 6 in N03 have an additional thermal offset. A warm GPU badge begins at 80°C as a demo styling threshold, not a hardware operating specification. The demo does not evaluate whether five fans provide sufficient real-world cooling redundancy.

Fan rotation is scaled for legibility: the visible period is `3900 / rpm` seconds, whereas a physical revolution would take `60 / rpm` seconds. F04 has CSS `animation: none`. Rack fan icons represent the remaining active cooling group; the six individual modules are visible in the chassis view.

## Interaction, freshness and lifecycle

Server, GPU, rack and component selection survives query refreshes. SVG controls support Enter and Space, and buttons expose their selection through `aria-pressed`. The chassis can emphasize data links or BMC links separately. Panel navigation links connect the three new examples and the existing data hall.

The shared runtime flags the feed stale when its meta sample exceeds 20 seconds or a query error follows a loaded snapshot. Last values remain visible with the warning; CSS motion is paused. Fresh samples restore motion unless the user has paused it. Motion controls do not stop the five-second queries. Reduced-motion preferences are honored. Timers and event listeners are removed on `panelwillunmount`, and reinitialization cleans up the previous runtime first.

## Observed validation

- All three dashboards installed through the portable installer and returned every required SQLite query frame.
- Rack/server and cluster/rack selections updated their inspectors; CPU selection opened component details; the BMC-plane control dimmed data paths.
- Five fan modules had active `rotate` animations with positive RPM; F04 showed 0 RPM and `animation-name: none`.
- Pausing motion set the working rotors to `paused`, while their numeric RPM readings continued updating. Resuming restored rotation.
- A 35-second simulator suspension produced a stale-feed warning and paused motion in the chassis. Freshness and motion recovered after resuming the sampler; F04 remained stopped.
- The checked inventory/aggregation/fan-fault and SQLite retention tests passed. Browser error logs for all three panels were empty during inspection.

The source is shared through `panels/ai-shared/`; the builder embeds it in each standalone dashboard export. Screenshots in `docs/images/` were captured from the running local Grafana instance.
