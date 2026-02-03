import os
import re

def fix_logo_in_files(directory):
    count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".html"):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Regex to find <div class="nav-logo-icon">R</div> with varying whitespace
                    new_content = re.sub(r'<div class="nav-logo-icon">\s*R\s*</div>', '<div class="nav-logo-icon"></div>', content)
                    
                    if new_content != content:
                        print(f"Fixing logo in: {path}")
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        count += 1
                except Exception as e:
                    print(f"Error processing {path}: {e}")
    print(f"Total files fixed: {count}")

if __name__ == "__main__":
    fix_logo_in_files(".")
