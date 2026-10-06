#!/usr/bin/env python3
"""Validate the exact Chrome ZIP before it is uploaded as a release artifact."""
import json
import re
import sys
from pathlib import Path
from zipfile import BadZipFile, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    'manifest.json', 'popup.html', 'background.js', 'LICENSE.txt', 'THIRD_PARTY_LICENSES.txt',
    '_locales/en/messages.json', '_locales/ja/messages.json', 'icon.svg',
    'icon/16.png', 'icon/32.png', 'icon/48.png', 'icon/128.png',
    'content-scripts/autofill.js', 'content-scripts/passkey.js', 'content-scripts/passkey-usage.js',
}
GENERATED = re.compile(r'(?:assets/popup-[\w-]+\.css|chunks/popup-[\w-]+\.js)\Z')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(path, root=ROOT):
    with ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate ZIP entries')
        require(REQUIRED.issubset(names), f'Missing files: {sorted(REQUIRED - set(names))}')
        require(all(name in REQUIRED or GENERATED.fullmatch(name) for name in names), 'Unexpected/development artifact in ZIP')
        generated = set(names) - REQUIRED
        require(len(generated) == 2, 'Unexpected number of generated assets')
        require(archive.testzip() is None, 'Corrupt ZIP entry')
        require(sum(entry.file_size for entry in archive.infolist()) < 10_000_000, 'Unexpected package size')
        manifest = json.loads(archive.read('manifest.json'))
        package = json.loads((root / 'package.json').read_text())
        require(manifest.get('manifest_version') == 3, 'Expected Manifest V3')
        require(manifest.get('name') == 'Login Pilot' and manifest.get('version') == package['version'], 'Unexpected name/version')
        require(sorted(manifest.get('permissions', [])) == ['activeTab', 'notifications', 'storage'], 'Unexpected permissions')
        require(not any(key in manifest for key in ['host_permissions', 'optional_permissions', 'optional_host_permissions',
                'externally_connectable', 'oauth2', 'key', 'web_accessible_resources', 'content_security_policy']), 'Unexpected manifest capability')
        require(manifest.get('default_locale') == 'en', 'Unexpected default locale')
        require(manifest.get('description') == '__MSG_extensionDescription__', 'Description is not localized')
        require(manifest.get('background') == {'service_worker': 'background.js'}, 'Unexpected background worker')
        require(manifest.get('action', {}).get('default_popup') == 'popup.html', 'Unexpected popup')
        expected_scripts = {
            'content-scripts/autofill.js': (['http://*/*', 'https://*/*'], False, 'ISOLATED'),
            'content-scripts/passkey.js': (['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*'], True, 'ISOLATED'),
            'content-scripts/passkey-usage.js': (['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*'], True, 'MAIN'),
        }
        scripts = manifest.get('content_scripts', [])
        require(len(scripts) == len(expected_scripts), 'Unexpected content scripts')
        seen = set()
        for script in scripts:
            files = script.get('js', [])
            require(len(files) == 1 and files[0] in expected_scripts and files[0] not in seen, 'Unexpected/duplicate content script file')
            seen.add(files[0])
            matches, frames, world = expected_scripts[files[0]]
            require(sorted(script.get('matches', [])) == matches and script.get('all_frames', False) == frames and
                    script.get('world', 'ISOLATED') == world and script.get('run_at') == 'document_start', 'Unexpected script scope')
            require(set(script).issubset({'js', 'matches', 'all_frames', 'world', 'run_at'}), 'Unexpected script capability')
        for locale in ['en', 'ja']:
            messages = json.loads(archive.read(f'_locales/{locale}/messages.json'))
            require(messages.get('extensionDescription', {}).get('message', '').strip(), f'Missing {locale} description')
        for bundled, source in [('LICENSE.txt', 'LICENSE'), ('THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_LICENSES.txt')]:
            require(archive.read(bundled) == (root / source).read_bytes(), f'{bundled} differs from source')
        popup = archive.read('popup.html').decode()
        references = re.findall(r'(?:src|href)="/?((?:assets|chunks)/[^"?#]+)"', popup)
        require(len(references) == 2 and set(references) == generated, 'Missing/unreferenced popup assets')


if __name__ == '__main__':
    try:
        version = json.loads((ROOT / 'package.json').read_text())['version']
        path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / f'.output/loginpilot-{version}-chrome.zip'
        verify(path)
        if len(sys.argv) == 1:
            build = ROOT / '.output/chrome-mv3'
            with ZipFile(path) as archive:
                built_names = {str(file.relative_to(build)) for file in build.rglob('*') if file.is_file()}
                require(built_names == set(archive.namelist()), 'Browser test build differs from ZIP file list')
                require(all(archive.read(name) == (build / name).read_bytes() for name in built_names),
                        'Browser test build differs from ZIP bytes')
        print(f'Verified release ZIP: {path.name}')
    except (ValueError, OSError, KeyError, BadZipFile) as error:
        sys.exit(f'Package verification failed: {error}')
