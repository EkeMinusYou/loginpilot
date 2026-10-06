import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('verify_package', Path(__file__).parents[1] / 'verify-package.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class PackageVerification(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.joinpath('package.json').write_text('{"version":"0.1.0"}')
        self.root.joinpath('LICENSE').write_bytes(b'license')
        self.root.joinpath('THIRD_PARTY_LICENSES.txt').write_bytes(b'notices')
        manifest = {
            'manifest_version': 3, 'name': 'Login Pilot', 'version': '0.1.0',
            'permissions': ['activeTab', 'notifications', 'storage'], 'default_locale': 'en',
            'description': '__MSG_extensionDescription__', 'background': {'service_worker': 'background.js'},
            'action': {'default_popup': 'popup.html'},
            'content_scripts': [
                {'js': ['content-scripts/autofill.js'], 'matches': ['http://*/*', 'https://*/*'], 'run_at': 'document_start'},
                *[{'js': [f'content-scripts/{name}.js'], 'matches': ['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*'],
                   'all_frames': True, 'run_at': 'document_start', **({'world': 'MAIN'} if name == 'passkey-usage' else {})}
                  for name in ['passkey', 'passkey-usage']],
            ],
        }
        self.files = {name: b'fixture' for name in validator.REQUIRED}
        self.files.update({
            'manifest.json': json.dumps(manifest).encode(), 'LICENSE.txt': b'license', 'THIRD_PARTY_LICENSES.txt': b'notices',
            'popup.html': b'<script src="/chunks/popup-test.js"></script><link href="/assets/popup-test.css">',
            'chunks/popup-test.js': b'code', 'assets/popup-test.css': b'css',
        })
        for locale in ['en', 'ja']:
            self.files[f'_locales/{locale}/messages.json'] = b'{"extensionDescription":{"message":"Description"}}'

    def check(self):
        path = self.root / 'extension.zip'
        with ZipFile(path, 'w') as archive:
            for name, content in self.files.items():
                archive.writestr(name, content)
        validator.verify(path, self.root)

    def test_accepts_complete_package(self):
        self.check()

    def test_rejects_missing_locale_or_legal_notice(self):
        for name in ['_locales/ja/messages.json', 'LICENSE.txt', 'THIRD_PARTY_LICENSES.txt']:
            with self.subTest(name=name):
                content = self.files.pop(name)
                with self.assertRaises(ValueError):
                    self.check()
                self.files[name] = content

    def test_rejects_development_or_credential_artifacts(self):
        for name in ['.env', 'tests/login.html', 'profile/Login Data', 'popup.pen', 'background.js.map', '../secret']:
            with self.subTest(name=name):
                self.files[name] = b'fixture'
                with self.assertRaises(ValueError):
                    self.check()
                del self.files[name]

    def test_rejects_added_permission_or_incorrect_version(self):
        original = self.files['manifest.json']
        for change in [{'permissions': ['activeTab', 'notifications', 'storage', 'debugger']}, {'version': '9.9.9'},
                       {'host_permissions': ['<all_urls>']}]:
            with self.subTest(change=change):
                manifest = json.loads(original)
                manifest.update(change)
                self.files['manifest.json'] = json.dumps(manifest).encode()
                with self.assertRaises(ValueError):
                    self.check()
        self.files['manifest.json'] = original

    def test_rejects_changed_license_or_missing_popup_asset(self):
        self.files['LICENSE.txt'] = b'wrong'
        with self.assertRaises(ValueError):
            self.check()
        self.files['LICENSE.txt'] = b'license'
        del self.files['chunks/popup-test.js']
        with self.assertRaises(ValueError):
            self.check()


if __name__ == '__main__':
    unittest.main()
