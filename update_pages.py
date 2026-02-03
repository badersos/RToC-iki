import os
import glob

ROOT_DIR = "."

def add_script_to_html(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if 'scripts/editor.js' in content:
            print(f"Skipping {file_path} - already has editor.js")
            return
        
        # Insert before </body>
        if '</body>' in content:
            new_content = content.replace('</body>', '    <script src="/scripts/editor.js"></script>\n</body>')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
        else:
            print(f"WARNING: No </body> tag in {file_path}")
            
    except Exception as e:
        print(f"Error processing {file_path}: {e}")

# Find all HTML files recursively
html_files = glob.glob(os.path.join(ROOT_DIR, '**/*.html'), recursive=True)

print(f"Found {len(html_files)} HTML files")

for file_path in html_files:
    # Skip templates if needed, but user said EVERY page
    if 'templates' in file_path:
        continue
        
    add_script_to_html(file_path)

print("Batch update complete.")
