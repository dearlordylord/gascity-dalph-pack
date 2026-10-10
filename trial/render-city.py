"""Render the sample city from the sourced trial environment; writes TOML to stdout."""
import json
import os
from pathlib import Path
import tomllib

source = Path(__file__).with_name('city.toml').read_text()
for placeholder, name in {
    'CITY_NAME': 'DALPH_CITY_NAME', 'RIG': 'DALPH_RIG',
    'BRANCH': 'DALPH_TARGET_BRANCH', 'TARGET_REPO': 'DALPH_TARGET_REPO',
    'PACK_ROOT': 'DALPH_PACK_ROOT',
}.items():
    source = source.replace('"@@' + placeholder + '@@"', json.dumps(os.environ[name]))
assert '@@' not in source
tomllib.loads(source)
print(source, end='')
