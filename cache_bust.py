import os
import re

root_dir = r"d:\RToC-iki"

# Regex to find script tags and append or replace the version query parameter
pattern_api = re.compile(r'(src="[^"]*api-config\.js)(?:\?v=\d+)?(")')
pattern_editor = re.compile(r'(src="[^"]*editor\.js)(?:\?v=\d+)?(")')

count = 0
for subdir, dirs, files in os.walk(root_dir):
    if '.git' in subdir or 'node_modules' in subdir:
        continue
    for file in files:
        if file.endswith(".html"):
            filepath = os.path.join(subdir, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                new_content = pattern_api.sub(r'\1?v=2\2', content)
                new_content = pattern_editor.sub(r'\1?v=2\2', new_content)
                
                if new_content != content:
                    count += 1
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(new_content)
            except Exception as e:
                print(f"Error processing {filepath}: {e}")

print(f"Updated {count} files.")
