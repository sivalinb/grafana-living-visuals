import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ai_sim', ROOT / 'scripts/simulate_ai_infrastructure.py')
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)


class InfrastructureTests(unittest.TestCase):
    def test_inventory_aggregates_and_fan_fault_are_consistent(self):
        for now in range(1_800_000_000, 1_800_000_360, 30):
            data = sim.snapshot(now)
            self.assertEqual(len(data['ai_racks']), 4)
            self.assertEqual(len(data['ai_nodes']), 32)
            self.assertEqual(len(data['ai_gpus']), 256)
            self.assertEqual(len({g['gpu_id'] for g in data['ai_gpus']}), 256)
            meta = data['ai_meta'][0]
            self.assertAlmostEqual(meta['power_kw'], sum(r['power_kw'] for r in data['ai_racks']), places=3)
            self.assertAlmostEqual(meta['network_gbps'], sum(n['network_gbps'] for n in data['ai_nodes']), places=1)
            self.assertEqual(sum(j['allocated_gpus'] for j in data['ai_jobs']), meta['gpu_count'])
            for rack in data['ai_racks']:
                nodes = [n for n in data['ai_nodes'] if n['rack_id'] == rack['rack_id']]
                self.assertAlmostEqual(rack['power_kw'], sum(n['power_kw'] for n in nodes) + 1.2, places=3)
                links = [l for l in data['ai_links'] if l['rack_id'] == rack['rack_id']]
                self.assertAlmostEqual(sum(l['throughput_gbps'] for l in links), rack['network_gbps'], delta=.11)
                self.assertTrue(all(0 <= l['util_pct'] <= 100 for l in links))
            self.assertTrue(all(0 <= g['util_pct'] <= 100 and 0 <= g['hbm_used_gb'] <= g['hbm_total_gb'] for g in data['ai_gpus']))
            failed = [f for f in data['ai_fans'] if f['status'] == 'failed']
            self.assertEqual([(f['fan_id'], f['rpm']) for f in failed], [('F04', 0)])
            self.assertGreater(failed[0]['target_rpm'], 0)
            self.assertTrue(all(f['rpm'] > 0 for f in data['ai_fans'] if f['status'] == 'running'))
            node = next(n for n in data['ai_nodes'] if n['node_id'] == sim.CHASSIS)
            self.assertEqual((node['fan_ok'], node['fan_total'], node['status']), (5, 6, 'degraded'))
            self.assertEqual(next(c['status'] for c in data['ai_components'] if c['component_id'] == 'BMC'), 'online')

    def test_sqlite_snapshot_history_and_synthetic_markers(self):
        with tempfile.TemporaryDirectory() as directory:
            db = sim.connect(Path(directory) / 'ai.sqlite')
            try:
                sim.write_sample(db, 1_800_000_000 - 1000)
                sim.write_sample(db, 1_800_000_000)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM ai_history').fetchone()[0], 3)
                for table in sim.SCHEMAS:
                    self.assertGreater(db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)
                    if table != 'ai_history':
                        self.assertEqual(db.execute(f'SELECT DISTINCT synthetic FROM {table}').fetchall(), [(1,)])
                        self.assertEqual(db.execute(f'SELECT DISTINCT sampled_at_ms FROM {table}').fetchall(), [(1_800_000_000_000,)])
            finally:
                db.close()


if __name__ == '__main__':
    unittest.main()
