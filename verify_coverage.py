import os
import glob

html_files = glob.glob('c:/Users/user/Documents/Slot3/**/*.html', recursive=True)
missing = []

for file_path in html_files:
    if 'templates' in file_path: continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'scripts/editor.js' not in content:
            missing.append(file_path)

if missing:
    print(f"MISSING editor.js in {len(missing)} files:")
    for m in missing:
        print(m)
else:
    print("All content pages have editor.js coverage (100%).")
