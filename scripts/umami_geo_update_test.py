"""Linux maintenance checks: python3 scripts/umami_geo_update_test.py."""
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import umami_geo_update as geo


class GeoArchiveTests(unittest.TestCase):
    def test_rejects_archive_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.tar.gz'
            with tarfile.open(archive, 'w:gz') as bundle:
                entry = tarfile.TarInfo('GeoLite2-City.mmdb')
                entry.type, entry.linkname = tarfile.SYMTYPE, '/etc/passwd'
                bundle.addfile(entry)
            target = root / 'download'
            target.mkdir()
            with self.assertRaisesRegex(ValueError, 'archive entry'):
                geo.download_candidate(target, archive.as_uri())

    def test_rejects_duplicate_database_entries(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.tar.gz'
            with tarfile.open(archive, 'w:gz') as bundle:
                for name in ['one/GeoLite2-City.mmdb', 'two/GeoLite2-City.mmdb']:
                    entry = tarfile.TarInfo(name)
                    entry.size = 4
                    bundle.addfile(entry, io.BytesIO(b'data'))
            target = root / 'download'
            target.mkdir()
            with self.assertRaisesRegex(ValueError, 'archive entry'):
                geo.download_candidate(target, archive.as_uri())

    @unittest.skipIf(os.name == 'nt', 'production updater uses Linux flock')
    def test_failed_download_preserves_current_database_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            current = root / 'GeoLite2-City.mmdb'
            current.write_bytes(b'previous verified database')
            with patch.object(geo, 'download_candidate', side_effect=TimeoutError('synthetic timeout')):
                for _ in range(2):
                    with self.assertRaises(TimeoutError):
                        geo.update(root)
            self.assertEqual(current.read_bytes(), b'previous verified database')
            self.assertEqual(list(root.glob('.geo-update-*')), [])


if __name__ == '__main__':
    unittest.main()
