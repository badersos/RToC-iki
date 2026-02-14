import os

root_dir = r"d:\RToC-iki"

for subdir, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith(".html"):
            filepath = os.path.join(subdir, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                new_content = content
                
                # Replace hrefs - catching more variations
                new_content = new_content.replace('href="/pages/locations.html"', 'href="/pages/appearances.html"')
                new_content = new_content.replace('href="/locations.html"', 'href="/appearances.html"')
                # Re-run previous ones just in case
                new_content = new_content.replace('href="locations.html"', 'href="appearances.html"')
                new_content = new_content.replace('href="../locations.html"', 'href="../appearances.html"')
                new_content = new_content.replace('href="pages/locations.html"', 'href="pages/appearances.html"')
                
                # Replace Link Text
                new_content = new_content.replace('>Locations</a>', '>Appearances</a>')
                
                if new_content != content:
                    print(f"Updating {filepath}")
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(new_content)
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
