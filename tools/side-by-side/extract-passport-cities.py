"""Extract geographic facts, not code, from the verified Conductor 0.87.6 city literal."""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
source = args.bundle.read_text()
match = re.search(r'\bUy=(\[\{name:.*?\]);function Hy\(', source)
if match is None:
    raise SystemExit('City literal boundary not found')
records = re.findall(r'\{name:("(?:[^"\\]|\\.)*"),coordinates:\[(-?(?:\d+(?:\.\d+)?|\.\d+)),(-?(?:\d+(?:\.\d+)?|\.\d+))\],tier:"(legendary|rare|uncommon|common)"\}', match[1])
cities = []
for raw_name, lon, lat, tier in records:
    name = json.loads(raw_name)
    slug = re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', re.sub(r"[.'’]", '', name.lower())))
    coordinates = [float(lon), float(lat)]
    if not -180 <= coordinates[0] <= 180 or not -90 <= coordinates[1] <= 90:
        raise SystemExit('Invalid city coordinates')
    cities.append({'slug': slug, 'name': name, 'coordinates': coordinates, 'tier': tier})
if len(cities) != 385 or len({city['slug'] for city in cities}) != 385:
    raise SystemExit('Unexpected city count or duplicates')
lines = [
    '// Geographic facts from Conductor 0.87.6. Reproduce with tools/side-by-side/extract-passport-cities.py.',
    '// Provenance: evidence/passport/README.md. No extracted code is executed.',
    'export type CityTier = "common" | "uncommon" | "rare" | "legendary";',
    'export interface PassportCity { slug: string; name: string; coordinates: readonly [number, number]; tier: CityTier }',
    'export const PASSPORT_CITIES: readonly PassportCity[] = [',
]
lines.extend('  ' + json.dumps(city, ensure_ascii=False, separators=(',', ':')) + ',' for city in cities)
lines.append('];')
args.output.write_text('\n'.join(lines) + '\n')
print(json.dumps({'bundle_sha256': hashlib.sha256(args.bundle.read_bytes()).hexdigest(), 'data_offset': match.start(1), 'data_length': len(match[1]), 'cities': len(cities), 'output_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))
