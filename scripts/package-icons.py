from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
Path('artifacts').mkdir(exist_ok=True)
with ZipFile('artifacts/craftly-icons.zip', 'w', ZIP_DEFLATED) as archive:
    for folder in [Path('docs/icons'), *Path('android/app/src/main/res').glob('mipmap-*')]:
        for path in sorted(folder.rglob('*')):
            if path.is_file(): archive.write(path, str(path))
    path = Path('android/app/src/main/res/values/icon-colors.xml')
    archive.write(path, str(path))
