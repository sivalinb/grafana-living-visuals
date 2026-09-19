"""Rebuild importable Grafana JSON using only checked-in sources and fictional data."""
import argparse
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = {'heartbeat': 'living-atlas-heartbeat.json', 'data-hall': 'living-data-hall.json',
           'ai-rack': 'living-ai-rack.json', 'gpu-cluster': 'living-gpu-cluster.json',
           'server-chassis': 'living-server-chassis.json'}


def build(name):
    source = ROOT / 'panels' / name
    dashboard = json.loads((source / 'dashboard.template.json').read_text())
    options = dashboard['panels'][0]['options']
    options['html'] = (source / 'panel.html').read_text()
    options['css'] = (source / 'panel.css').read_text()
    options['onInit'] = (source / 'on-init.js').read_text()
    if name in {'ai-rack', 'gpu-cluster', 'server-chassis'}:
        common = ROOT / 'panels/ai-shared'
        options['css'] = (common / 'panel.css').read_text() + '\n' + options['css']
        options['onInit'] = (common / 'runtime.js').read_text() + '\n' + options['onInit']
    if name == 'heartbeat':
        fixture = json.loads((ROOT / 'data/heartbeat-demo.json').read_text())
        if fixture.get('synthetic') is not True:
            raise ValueError('The heartbeat bundle must be explicitly marked synthetic.')
        options['codeData'] = json.dumps(fixture, separators=(',', ':'))
        image = 'data:image/jpeg;base64,' + base64.b64encode((ROOT / 'assets/heart.jpg').read_bytes()).decode()
        options['html'] = options['html'].replace('__HEART_IMAGE__', image)
    return json.dumps(dashboard, ensure_ascii=False, indent=2) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if checked-in dashboard exports differ from their sources')
    args = parser.parse_args()
    out = ROOT / 'dashboards'
    out.mkdir(exist_ok=True)
    for name, filename in OUTPUTS.items():
        expected = build(name)
        path = out / filename
        if args.check:
            if not path.exists() or path.read_text() != expected:
                raise SystemExit(f'Outdated export: {path.relative_to(ROOT)}; run scripts/build_dashboards.py')
        else:
            path.write_text(expected)
        print(('Verified ' if args.check else 'Built ') + str(path.relative_to(ROOT)))


if __name__ == '__main__':
    main()
