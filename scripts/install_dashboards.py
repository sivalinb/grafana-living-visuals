"""Install this demo into an existing Grafana using explicit credentials and paths."""
import argparse
import base64
import getpass
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_VERSIONS = {'gapit-htmlgraphics-panel': '2.2.3', 'frser-sqlite-datasource': '4.0.6'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=os.environ.get('GRAFANA_URL', 'http://127.0.0.1:3000'))
    parser.add_argument('--db', required=True, help='Absolute database path as seen by the Grafana server')
    parser.add_argument('--user', default=os.environ.get('GRAFANA_USER'))
    parser.add_argument('--install-plugins', action='store_true', help='Install missing plugins; requires a Grafana server admin')
    parser.add_argument('--overwrite', action='store_true', help='Update dashboards with matching UIDs; never changes a conflicting data source')
    parser.add_argument('--dry-run', action='store_true', help='Print the plan without authentication or API calls')
    args = parser.parse_args()
    if not Path(args.db).is_absolute():
        parser.error('--db must be an absolute path visible to the Grafana server')
    dashboards = [json.loads(p.read_text()) for p in sorted((ROOT / 'dashboards').glob('*.json'))]
    if len(dashboards) != 2:
        raise SystemExit('Build the two dashboards before installing.')
    if args.dry_run:
        print(json.dumps({'grafana': args.url, 'sqlite_path': args.db,
                          'data_source': 'living-data-hall-sim', 'dashboards': [d['uid'] for d in dashboards]}, indent=2))
        return
    token = os.environ.get('GRAFANA_TOKEN')
    if token:
        authorization = 'Bearer ' + token
    else:
        user = args.user or input('Grafana admin username: ')
        password = os.environ.get('GRAFANA_PASSWORD') or getpass.getpass('Grafana password: ')
        authorization = 'Basic ' + base64.b64encode((user + ':' + password).encode()).decode()
    opener = urllib.request.build_opener(NoRedirect)
    base = args.url.rstrip('/')

    def api(path, body=None, missing_ok=False):
        request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Authorization': authorization, 'Content-Type': 'application/json'},
                                         method='POST' if body is not None else 'GET')
        try:
            with opener.open(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            if missing_ok and error.code == 404:
                return None
            raise RuntimeError(f'Grafana API {error.code} for {path}') from None

    plugins = {p['id'] for p in api('/api/plugins')}
    for plugin, version in PLUGIN_VERSIONS.items():
        if plugin not in plugins:
            if not args.install_plugins:
                raise SystemExit(f'Missing {plugin}. Install it in Grafana or pass --install-plugins with server-admin credentials.')
            api(f'/api/plugins/{plugin}/install', {'version': version})
            print(f'Installed {plugin} {version}')
    uid = 'living-data-hall-sim'
    existing = api('/api/datasources/uid/' + uid, missing_ok=True)
    if existing:
        if existing['type'] != 'frser-sqlite-datasource' or existing.get('jsonData', {}).get('path') != args.db:
            raise SystemExit('Existing data source UID points elsewhere. No data-source configuration was changed.')
    else:
        api('/api/datasources', {'uid': uid, 'name': 'Data Hall · SIMULATED LIVE',
                               'type': 'frser-sqlite-datasource', 'access': 'proxy', 'isDefault': False,
                               'jsonData': {'path': args.db, 'pathOptions': 'mode=ro', 'attachLimit': 0}})
    data_hall = next(d for d in dashboards if d['uid'] == 'living-data-hall')
    now = int(time.time() * 1000)
    result = api('/api/ds/query', {'from': str(now - 900000), 'to': str(now),
                                 'queries': [dict(q, intervalMs=5000, maxDataPoints=1000) for q in data_hall['panels'][0]['targets']]})
    for ref in ['A', 'B', 'C']:
        entry = result.get('results', {}).get(ref, {})
        if entry.get('error') or not entry.get('frames'):
            raise SystemExit(f'Telemetry query {ref} failed. Check the database path and run the simulator first.')
    folder = next((f for f in api('/api/folders') if f['title'] == 'Living Visuals'), None)
    folder = folder or api('/api/folders', {'title': 'Living Visuals'})
    for dashboard in dashboards:
        current = api('/api/dashboards/uid/' + dashboard['uid'], missing_ok=True)
        if current and not args.overwrite:
            raise SystemExit(f'Dashboard {dashboard["uid"]} exists. Pass --overwrite to replace it intentionally.')
        if current:
            dashboard['id'] = current['dashboard']['id']
            dashboard['version'] = current['dashboard']['version']
        saved = api('/api/dashboards/db', {'dashboard': dashboard, 'folderUid': folder['uid'], 'overwrite': False,
                                         'message': 'Install Grafana Living Visuals demo.'})
        print(base + saved['url'])


if __name__ == '__main__':
    main()
