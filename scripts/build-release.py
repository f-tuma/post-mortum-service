"""Build a self-contained Foundry system and its GitHub manifest release assets."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path('.'))
parser.add_argument('--output', type=Path, default=Path('dist/release'))
parser.add_argument('--repo', required=True)
parser.add_argument('--tag')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
    raise SystemExit('Invalid GitHub repository.')
root = args.root.resolve()
manifest = json.loads((root / 'system.json').read_text())
version = manifest['version']
if manifest['id'] != 'pms' or not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Invalid PMS manifest version.')
tag = f'v{version}'
if args.tag and args.tag != tag:
    raise SystemExit('Git tag does not match the system manifest version.')
repo_url = f'https://github.com/{args.repo}'
manifest.update(url=repo_url, manifest=f'{repo_url}/releases/latest/download/system.json',
                download=f'{repo_url}/releases/download/{tag}/pms.zip')
manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()

# Only the native system belongs in the ZIP, never repository tooling or worlds.
folders = ('assets', 'modules', 'styles', 'lang', 'cases', 'packs', 'templates')
files = sorted(p for folder in folders for p in (root / folder).rglob('*') if p.is_file())
files += [root / name for name in ('template.json', 'LICENSE', 'LICENSE.txt') if (root / name).is_file()]
if any(p.is_symlink() for p in files):
    raise SystemExit('Distribution must contain real files, not symlinks.')
names = {p.relative_to(root).as_posix() for p in files} | {'system.json'}
for name in [*manifest['esmodules'], *manifest['styles'], *[v['path'] for v in manifest['languages']]]:
    if name not in names:
        raise SystemExit(f'Missing manifest resource: {name}')
for path in files:
    if path.suffix != '.mjs':
        continue
    for ref in re.findall(r'''(?:\bfrom\s*|\bimport\s*\()\s*['"](\.[^'"]+)['"]''', path.read_text()):
        target = (path.parent / ref).resolve().relative_to(root).as_posix()
        if target not in names:
            raise SystemExit(f'Missing module: {target}')
case_path = root / 'cases/tetove.json'
case = json.loads(case_path.read_text())
if case['id'] != 'tetove' or len(case['npcs']) != 9:
    raise SystemExit('Missing or invalid introductory case.')
for npc in case['npcs']:
    path = npc['img'].removeprefix('systems/pms/')
    if path not in names:
        raise SystemExit(f'Missing NPC portrait: {path}')
for plan in case['scenePlans']:
    art = [plan.get('garden'), *[v for level in plan['levels'] for v in (level.get('asset'), level.get('overlay'))],
           *[t['asset'] for t in plan.get('supplementalTiles', [])]]
    for asset in filter(None, art):
        path = asset.removeprefix('systems/pms/') if asset.startswith('systems/pms/') else 'assets/plans/' + asset
        if path not in names:
            raise SystemExit(f'Missing map asset: {path}')
args.output.mkdir(parents=True, exist_ok=True)
archive_path = args.output / 'pms.zip'
with ZipFile(archive_path, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('system.json', manifest_bytes)
    for path in files:
        archive.write(path, path.relative_to(root).as_posix())
with ZipFile(archive_path) as archive:
    if archive.testzip() is not None:
        raise SystemExit('ZIP integrity check failed.')
    if archive.read('system.json') != manifest_bytes:
        raise SystemExit('ZIP manifest differs from installation manifest.')
(args.output / 'system.json').write_bytes(manifest_bytes)
(args.output / 'tetove.json').write_bytes(case_path.read_bytes())
assets = ('pms.zip', 'system.json', 'tetove.json')
checksums = [f'{hashlib.sha256((args.output / name).read_bytes()).hexdigest()}  {name}\n' for name in assets]
(args.output / 'SHA256SUMS.txt').write_text(''.join(checksums))
print(json.dumps({'version': version, 'tag': tag, 'manifest': manifest['manifest'],
                  'download': manifest['download'], 'files': len(names), 'bytes': archive_path.stat().st_size}))
