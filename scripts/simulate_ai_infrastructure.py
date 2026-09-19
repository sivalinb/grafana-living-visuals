"""One coherent, explicitly simulated AI rack / cluster / chassis telemetry feed."""
import argparse
import math
import signal
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHASSIS = 'AI-R01-N03'
SCHEMAS = {
    'ai_meta': 'cluster_id TEXT PRIMARY KEY, sampled_at_ms INTEGER, rack_count INTEGER, node_count INTEGER, gpu_count INTEGER, gpu_util_pct REAL, power_kw REAL, hbm_used_gb REAL, hbm_total_gb REAL, network_gbps REAL, failed_fans INTEGER, synthetic INTEGER',
    'ai_racks': 'rack_id TEXT PRIMARY KEY, node_count INTEGER, gpu_count INTEGER, gpu_util_pct REAL, power_kw REAL, capacity_kw REAL, inlet_c REAL, outlet_c REAL, network_gbps REAL, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_nodes': 'node_id TEXT PRIMARY KEY, rack_id TEXT, slot INTEGER, gpu_count INTEGER, gpu_util_pct REAL, cpu_util_pct REAL, power_kw REAL, gpu_temp_c REAL, hbm_used_gb REAL, network_gbps REAL, fan_ok INTEGER, fan_total INTEGER, job_id TEXT, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_gpus': 'gpu_id TEXT PRIMARY KEY, node_id TEXT, rack_id TEXT, gpu_index INTEGER, util_pct REAL, temp_c REAL, power_w REAL, hbm_used_gb REAL, hbm_total_gb REAL, fabric_gbps REAL, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_links': 'link_id TEXT PRIMARY KEY, rack_id TEXT, spine_id TEXT, throughput_gbps REAL, capacity_gbps REAL, util_pct REAL, latency_us REAL, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_components': 'component_id TEXT PRIMARY KEY, node_id TEXT, kind TEXT, label TEXT, util_pct REAL, temp_c REAL, power_w REAL, throughput_gbps REAL, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_fans': 'fan_id TEXT PRIMARY KEY, node_id TEXT, rpm INTEGER, target_rpm INTEGER, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_jobs': 'job_id TEXT PRIMARY KEY, label TEXT, kind TEXT, allocated_gpus INTEGER, tokens_per_s REAL, progress_pct REAL, status TEXT, sampled_at_ms INTEGER, synthetic INTEGER',
    'ai_history': 'sampled_at_ms INTEGER, scope TEXT, power_kw REAL, gpu_util_pct REAL, network_gbps REAL, PRIMARY KEY (sampled_at_ms, scope)',
}


def connect(path):
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.execute('PRAGMA journal_mode=WAL')
    for table, columns in SCHEMAS.items():
        db.execute(f'CREATE TABLE IF NOT EXISTS {table} ({columns})')
    return db


def snapshot(now):
    stamp = int(now * 1000)
    result = {table: [] for table in SCHEMAS}
    def add(table, **values):
        values.update(sampled_at_ms=stamp, synthetic=1)
        result[table].append(values)
        return values
    for rack_no in range(1, 5):
        rack_id = f'AI-R{rack_no:02d}'
        nodes = []
        for slot in range(1, 9):
            node_id = f'{rack_id}-N{slot:02d}'
            phase = (rack_no * 8 + slot) * .49
            gpu_rows = []
            for index in range(8):
                util = 75 + 11 * math.sin(now / 37 + phase) + 5 * math.cos(now / 13 + index)
                if rack_no == 4:
                    util -= 14
                temp = 56 + util * .18 + 2.4 * math.sin(now / 51 + phase + index)
                if node_id == CHASSIS and index in (5, 6):
                    temp += 10
                gpu_rows.append(add('ai_gpus', gpu_id=f'{node_id}-G{index}', node_id=node_id, rack_id=rack_id,
                    gpu_index=index, util_pct=round(util, 1), temp_c=round(temp, 1),
                    power_w=round(220 + util * 4.9, 1), hbm_used_gb=round(45 + util * .25 + 3 * math.sin(phase + index), 1),
                    hbm_total_gb=80.0, fabric_gbps=round(120 + util * 3.5 + 20 * math.sin(now / 17 + index), 1),
                    status='warm' if temp >= 80 else 'healthy'))
            avg_util = sum(g['util_pct'] for g in gpu_rows) / 8
            cpu_util = 42 + 13 * math.sin(now / 29 + phase)
            power = (sum(g['power_w'] for g in gpu_rows) + 900 + cpu_util * 5) / 1000
            network = 175 + avg_util * 1.5 + 20 * math.sin(now / 19 + phase)
            nodes.append(add('ai_nodes', node_id=node_id, rack_id=rack_id, slot=slot, gpu_count=8,
                gpu_util_pct=round(avg_util, 1), cpu_util_pct=round(cpu_util, 1), power_kw=round(power, 3),
                gpu_temp_c=max(g['temp_c'] for g in gpu_rows), hbm_used_gb=round(sum(g['hbm_used_gb'] for g in gpu_rows), 1),
                network_gbps=round(network, 1), fan_ok=5 if node_id == CHASSIS else 6, fan_total=6,
                job_id='aurora-train' if rack_no < 4 else 'atlas-serve',
                status='degraded' if node_id == CHASSIS else 'healthy'))
        rack_network = sum(n['network_gbps'] for n in nodes)
        add('ai_racks', rack_id=rack_id, node_count=8, gpu_count=64,
            gpu_util_pct=round(sum(n['gpu_util_pct'] for n in nodes) / 8, 1),
            power_kw=round(sum(n['power_kw'] for n in nodes) + 1.2, 3), capacity_kw=80.0,
            inlet_c=round(24.2 + math.sin(now / 49 + rack_no), 1), outlet_c=round(36.2 + math.sin(now / 41 + rack_no), 1),
            network_gbps=round(rack_network, 1), status='degraded' if rack_no == 1 else 'healthy')
        split = .5 + .07 * math.sin(now / 31 + rack_no)
        for spine, share in [('SPINE-A', split), ('SPINE-B', 1 - split)]:
            rate = round(rack_network * share, 1)
            add('ai_links', link_id=f'{rack_id}:{spine}', rack_id=rack_id, spine_id=spine,
                throughput_gbps=rate, capacity_gbps=1600.0, util_pct=round(rate / 16, 1),
                latency_us=round(2.8 + rate / 1400 + .25 * math.sin(now / 11 + rack_no), 2), status='up')
    all_nodes = result['ai_nodes']
    all_gpus = result['ai_gpus']
    chassis = next(n for n in all_nodes if n['node_id'] == CHASSIS)
    for i in (0, 1):
        util = chassis['cpu_util_pct'] + (i - .5) * 6
        add('ai_components', component_id=f'CPU{i}', node_id=CHASSIS, kind='cpu', label=f'CPU {i}',
            util_pct=round(util, 1), temp_c=round(47 + util * .28, 1), power_w=round(190 + util * 2.1, 1),
            throughput_gbps=None, status='healthy')
    for i in (0, 1):
        add('ai_components', component_id=f'PCIE{i}', node_id=CHASSIS, kind='switch', label=f'PCIe switch {i}',
            util_pct=round(chassis['gpu_util_pct'] * .73, 1), temp_c=round(49 + 3 * math.sin(now / 27 + i), 1),
            power_w=42.0, throughput_gbps=round(chassis['network_gbps'] / 2 + 110, 1), status='healthy')
    for i in (0, 1):
        add('ai_components', component_id=f'NIC{i}', node_id=CHASSIS, kind='nic', label=f'Fabric NIC {i}',
            util_pct=round(chassis['network_gbps'] / 4, 1), temp_c=round(51 + 2 * math.sin(now / 37 + i), 1),
            power_w=36.0, throughput_gbps=round(chassis['network_gbps'] / 2, 1), status='up')
    add('ai_components', component_id='BMC', node_id=CHASSIS, kind='bmc', label='BMC', util_pct=None,
        temp_c=round(39 + math.sin(now / 43), 1), power_w=8.0, throughput_gbps=None, status='online')
    for i in range(1, 7):
        target = int(6400 + 500 * math.sin(now / 33 + i))
        add('ai_fans', fan_id=f'F{i:02d}', node_id=CHASSIS, rpm=0 if i == 4 else target + int(90 * math.cos(now / 7 + i)),
            target_rpm=target, status='failed' if i == 4 else 'running')
    add('ai_jobs', job_id='aurora-train', label='Aurora / distributed training', kind='training', allocated_gpus=192,
        tokens_per_s=round(38000 + 2400 * math.sin(now / 37)), progress_pct=round((now % 1800) / 18, 1), status='running')
    add('ai_jobs', job_id='atlas-serve', label='Atlas / inference serving', kind='inference', allocated_gpus=64,
        tokens_per_s=round(12500 + 1100 * math.sin(now / 23)), progress_pct=None, status='serving')
    meta = add('ai_meta', cluster_id='AURORA-01', rack_count=4, node_count=32, gpu_count=256,
        gpu_util_pct=round(sum(g['util_pct'] for g in all_gpus) / len(all_gpus), 1),
        power_kw=round(sum(r['power_kw'] for r in result['ai_racks']), 3),
        hbm_used_gb=round(sum(g['hbm_used_gb'] for g in all_gpus), 1), hbm_total_gb=20480.0,
        network_gbps=round(sum(n['network_gbps'] for n in all_nodes), 1), failed_fans=1)
    for scope, source in [('cluster', meta), ('rack', result['ai_racks'][0]), ('chassis', chassis)]:
        result['ai_history'].append(dict(sampled_at_ms=stamp, scope=scope, power_kw=source['power_kw'],
            gpu_util_pct=source['gpu_util_pct'], network_gbps=source['network_gbps']))
    return result


def write_sample(db, now):
    data = snapshot(now)
    with db:
        for table, rows in data.items():
            columns = list(rows[0])
            names = ','.join(columns)
            marks = ','.join('?' for _ in columns)
            db.executemany(f'INSERT OR REPLACE INTO {table} ({names}) VALUES ({marks})',
                           [[row[key] for key in columns] for row in rows])
        db.execute('DELETE FROM ai_history WHERE sampled_at_ms < ?', (int((now - 900) * 1000),))
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=ROOT / 'runtime/ai-telemetry.sqlite')
    parser.add_argument('--interval', type=float, default=2)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if not 0 < args.interval < float('inf'):
        parser.error('--interval must be a finite positive number')
    running = True
    def stop(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    db = connect(args.db)
    print(f'SIMULATED AI infrastructure: 4 racks / 32 nodes / 256 GPUs; {args.db.resolve()}', flush=True)
    try:
        while running:
            write_sample(db, time.time())
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        db.close()


if __name__ == '__main__':
    main()
