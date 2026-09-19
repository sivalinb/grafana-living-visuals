import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('build_dashboards')
simulator = load('simulate_data_hall')


class DemoTests(unittest.TestCase):
    def test_heartbeat_fixture_is_fictional_and_ordered(self):
        data = json.loads((ROOT / 'data/heartbeat-demo.json').read_text())
        self.assertIs(data['synthetic'], True)
        self.assertEqual(len(data['workouts']), 8)
        for workout in data['workouts']:
            self.assertGreater(workout['duration'], 0)
            self.assertTrue(workout['hr'])
            timestamps = [s['t'] for s in workout['hr']]
            self.assertEqual(timestamps, sorted(timestamps))
            self.assertTrue(all(math.isfinite(s['bpm']) and s['bpm'] > 0 for s in workout['hr']))

    def test_simulated_meters_and_missing_rack(self):
        for t in range(1_800_000_000, 1_800_000_120, 5):
            racks, hall = simulator.make_samples(t, t - 120)
            self.assertEqual(len({r[0] for r in racks}), 24)
            self.assertEqual(hall[2], 23)
            self.assertEqual(hall[12:15], [1, 1, 1])
            self.assertAlmostEqual(hall[5], hall[4] / hall[3], delta=.001)
            self.assertGreater(hall[3], sum(r[4] or 0 for r in racks))
            self.assertTrue(all(0 <= r[8] <= 100 for r in racks if r[8] is not None))
            offline = next(r for r in racks if r[0] == 'D02')
            self.assertTrue(all(offline[k] is None for k in [4, 6, 7, 8, 9, 10, 11]))
            self.assertEqual(offline[16], (t - 120) * 1000)

    def test_sqlite_transaction_and_retention(self):
        with tempfile.TemporaryDirectory() as tmp:
            connection = simulator.connect(Path(tmp) / 'telemetry.sqlite')
            try:
                now = 1_800_000_000
                simulator.write_sample(connection, now - 1000, now - 1200)
                simulator.write_sample(connection, now, now - 120)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM racks').fetchone()[0], 24)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM hall_history').fetchone()[0], 1)
                stamp = connection.execute('SELECT sampled_at_ms FROM hall').fetchone()[0]
                self.assertEqual(stamp, now * 1000)
                self.assertEqual(connection.execute("SELECT power_kw FROM racks WHERE rack_id='D02'").fetchone(), (None,))
            finally:
                connection.close()

    def test_generated_dashboards_match_sources(self):
        for name, filename in builder.OUTPUTS.items():
            expected = builder.build(name)
            self.assertEqual((ROOT / 'dashboards' / filename).read_text(), expected)
            self.assertNotIn('/Users/', expected)
            self.assertNotIn('admin-password', expected)
            self.assertNotIn('__HEART_IMAGE__', expected)
            d = json.loads(expected)
            self.assertEqual(d['panels'][0]['type'], 'gapit-htmlgraphics-panel')
            self.assertIsNone(d['id'])


if __name__ == '__main__':
    unittest.main()
