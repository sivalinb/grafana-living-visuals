"""Continuously write clearly synthetic data hall telemetry for the Grafana demo."""
import argparse
import math
import signal
import sqlite3
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE.parent / 'runtime' / 'telemetry.sqlite'
running = True


def stop(*_):
    global running
    running = False


def connect(db=DB):
    db = Path(db).expanduser().resolve()
    db.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db, timeout=10)
    connection.execute('PRAGMA journal_mode=WAL')
    connection.executescript('''
    CREATE TABLE IF NOT EXISTS racks (
      rack_id TEXT PRIMARY KEY, row_id TEXT, position INTEGER, status TEXT,
      power_kw REAL, capacity_kw REAL, inlet_c REAL, outlet_c REAL,
      cpu_pct REAL, memory_pct REAL, network_gbps REAL, fan_rpm REAL,
      servers INTEGER, occupied_u INTEGER, total_u INTEGER,
      sampled_at_ms INTEGER, last_seen_ms INTEGER, synthetic INTEGER
    );
    CREATE TABLE IF NOT EXISTS hall (
      hall_id TEXT PRIMARY KEY, rack_count INTEGER, reporting INTEGER,
      it_power_kw REAL, facility_power_kw REAL, pue REAL,
      avg_inlet_c REAL, max_inlet_c REAL, network_gbps REAL,
      avg_cpu_pct REAL, humidity_pct REAL, cooling_kw REAL,
      critical_count INTEGER, warning_count INTEGER, offline_count INTEGER,
      sampled_at_ms INTEGER, synthetic INTEGER
    );
    CREATE TABLE IF NOT EXISTS hall_history (
      sampled_at_ms INTEGER PRIMARY KEY, it_power_kw REAL,
      avg_inlet_c REAL, pue REAL, network_gbps REAL
    );
    ''')
    return connection


def make_samples(now, offline_since):
    racks = []
    metered_power = 0
    for row in range(4):
        for col in range(6):
            i = row * 6 + col
            rack_id = f'{chr(65 + row)}{col + 1:02d}'
            phase = i * .63
            cpu = 48 + 17 * math.sin(now / 23 + phase) + 9 * math.cos(now / 11 + phase * 2)
            memory = 60 + 13 * math.sin(now / 49 + phase)
            power = 3.1 + cpu * .063 + .28 * math.sin(now / 9 + phase)
            inlet = 23.3 + row * .45 + .75 * math.sin(now / 37 + phase)
            if rack_id == 'B04':
                inlet = 29.2 + .55 * math.sin(now / 29)
            elif rack_id == 'C05':
                inlet = 33.1 + .7 * math.sin(now / 31)
                power = 8.6 + .35 * math.sin(now / 23)
                cpu = 87 + 5 * math.sin(now / 19)
            outlet = inlet + 7.3 + power * .45
            metered_power += power
            network = 4.3 + cpu * .14 + 2 * math.sin(now / 7 + phase)
            fans = 3200 + (inlet - 22) * 170 + cpu * 12
            status = 'critical' if inlet >= 32 else 'warning' if inlet >= 28 else 'healthy'
            sampled = int(now * 1000)
            values = [rack_id, chr(65 + row), col + 1, status,
                      round(power, 3), 10.0, round(inlet, 2), round(outlet, 2),
                      round(cpu, 1), round(memory, 1), round(network, 2), round(fans),
                      28 + i % 9, 31 + i % 10, 42, sampled, sampled, 1]
            if rack_id == 'D02':
                values[3] = 'offline'
                for k in [4, 6, 7, 8, 9, 10, 11]:
                    values[k] = None
                values[16] = int(offline_since * 1000)
            racks.append(values)
    reporting = [r for r in racks if r[3] != 'offline']
    # The independent hall meter still sees rack D02's load during its telemetry outage.
    it_power = metered_power
    cooling = 23.5 + 2.5 * math.sin(now / 43)
    facility = it_power + cooling + 12.3
    hall = ['DH-01', len(racks), len(reporting), round(it_power, 3), round(facility, 3),
            round(facility / it_power, 3), round(sum(r[6] for r in reporting) / len(reporting), 2),
            round(max(r[6] for r in reporting), 2), round(sum(r[10] for r in reporting), 2),
            round(sum(r[8] for r in reporting) / len(reporting), 1),
            round(45.2 + 2.2 * math.sin(now / 83), 1), round(cooling, 2),
            sum(r[3] == 'critical' for r in racks), sum(r[3] == 'warning' for r in racks),
            sum(r[3] == 'offline' for r in racks), int(now * 1000), 1]
    return racks, hall


def write_sample(connection, now, offline_since):
    racks, hall = make_samples(now, offline_since)
    with connection:
        connection.executemany('INSERT OR REPLACE INTO racks VALUES (' + ','.join('?' * 18) + ')', racks)
        connection.execute('INSERT OR REPLACE INTO hall VALUES (' + ','.join('?' * 17) + ')', hall)
        connection.execute('INSERT OR REPLACE INTO hall_history VALUES (?,?,?,?,?)',
                           (hall[15], hall[3], hall[6], hall[5], hall[8]))
        connection.execute('DELETE FROM hall_history WHERE sampled_at_ms < ?', (int((now - 900) * 1000),))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--db', type=Path, default=DB, help='Output SQLite database (default: runtime/telemetry.sqlite)')
    parser.add_argument('--interval', type=float, default=2, help='Seconds between samples (default: 2)')
    args = parser.parse_args()
    if args.interval <= 0:
        parser.error('--interval must be positive')
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    connection = connect(args.db)
    offline_since = time.time() - 120
    print(f'SIMULATED telemetry: 24 racks in DH-01; database={args.db.resolve()}', flush=True)
    try:
        while running:
            write_sample(connection, time.time(), offline_since)
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        connection.close()


if __name__ == '__main__':
    main()
