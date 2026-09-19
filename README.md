# Grafana Living Visuals

Two animated Grafana experiences: an anatomical heartbeat replay and an interactive data hall with 24 racks. The visuals run natively in the **HTML Graphics** panel and have editable HTML, CSS, and JavaScript sources.

**All bundled readings are fictional or simulated.** No real health data, production infrastructure, credentials, or running databases are included.

## The two visuals

| Visual | What moves | What you can inspect |
| --- | --- | --- |
| Anatomical heartbeat | A two-part pulse follows the recorded BPM | Eight fictional workouts; play/pause, scrubber, replay speed, reduced motion, and a missing-signal demonstration |
| Living Data Hall | Rack LEDs follow CPU activity; cooling paths move; cabinet colors reflect the selected metric | 24 racks in four rows; power, inlet/outlet temperature, CPU, memory, network, fans, inventory, hall meters, PUE, and freshness |

The heartbeat embeds its artwork and recorded samples in the dashboard. The data hall uses real Grafana queries against a local simulator that writes fresh SQLite rows every two seconds. Grafana refreshes the panel every five seconds. The data is simulated; the data-source integration and freshness behavior are operational.

The data hall includes a warm rack (B04), a hotspot (C05), and an offline rack (D02). Missing readings stay empty. If the entire feed becomes stale, animation pauses and the panel shows its sample age.

## Run with an existing Grafana

The checked-in exports were verified with Grafana **12.1.1**, HTML Graphics **2.2.3**, and the SQLite data source **4.0.6**. Python **3.10+** runs the simulator and build tools without additional packages. Node.js is only needed for JavaScript syntax checks.

1. Clone this repository and rebuild the exports:

   ```sh
   git clone https://github.com/sivalinb/grafana-living-visuals.git
   cd grafana-living-visuals
   python3 scripts/build_dashboards.py
   ```

2. Start the simulator and keep this terminal running:

   ```sh
   python3 scripts/simulate_data_hall.py
   ```

3. In another terminal, install the plugins, data source, and dashboards. Substitute your Grafana URL and admin username. The password is prompted without echo:

   ```sh
   python3 scripts/install_dashboards.py \
     --url http://127.0.0.1:3030 \
     --user YOUR_GRAFANA_ADMIN \
     --db "$PWD/runtime/telemetry.sqlite" \
     --install-plugins
   ```

   The installer prints the dashboard links and groups them in **Living Visuals**. It leaves existing dashboards intact unless `--overwrite` is provided. It refuses to repoint a conflicting data source. Existing plugin versions are reused.

   For a Grafana service account, set `GRAFANA_TOKEN` in your local environment and omit `--user`. Plugin installation requires server-admin permissions; install the plugins separately if the service account cannot do that. Credentials are never written into dashboards or committed configuration.

For Docker or remote Grafana, `--db` must be the path **inside the Grafana server's filesystem**, with access to the simulator database and its SQLite WAL/SHM sidecars. The host path alone is insufficient. The SQLite plugin runs on the server; the browser does not read the file.

The heartbeat can also be imported alone from `dashboards/living-atlas-heartbeat.json`; it needs HTML Graphics but no data source. For the data hall, use the installer or create the data source with UID `living-data-hall-sim`, then import `dashboards/living-data-hall.json`.

## Explore the implementation

- [Data-source exploration and integration options](docs/data-source-exploration.md)
- [Data contract, freshness, and animation design](docs/architecture.md)
- [Validation and observed behavior](docs/validation.md)
- [Asset provenance](docs/provenance.md)

```text
assets/                     Anatomical heart artwork
data/heartbeat-demo.json     Eight explicitly fictional recorded sessions
panels/heartbeat/           Editable HTML, CSS, JS, and dashboard template
panels/data-hall/           Editable rack map, rendering logic, and template
dashboards/                Generated, directly importable Grafana JSON
scripts/                   Portable builder, simulator, and API installer
tests/                     Data, build, and packaging checks
runtime/                   Local generated telemetry; ignored by Git
```

## Verify changes

```sh
python3 scripts/build_dashboards.py --check
python3 -m unittest discover -s tests -v
node --check panels/heartbeat/on-init.js
node --check panels/data-hall/on-init.js
```

Edit a panel's sources, rebuild the JSON, then import the updated export or run the installer with `--overwrite`. The local simulator is a foreground process, not a startup service. Stop it with Ctrl-C; Grafana retains the last snapshot and reports the feed as stale.
