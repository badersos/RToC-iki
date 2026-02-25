import os
import re
from pathlib import Path

def normalize_nav(html_content, file_path):
    # 1. First, remove ALL manual 'active' classes from links
    html_content = re.sub(r'class="nav-link active"', 'class="nav-link"', html_content)
    
    # 2. Remove problematic inline styles on nav-links (especially the one on Concepts)
    html_content = re.sub(r'<a href="[^"]*concepts\.html" class="nav-link"\s+style="[^"]*">Concepts</a>', 
                          r'<a href="concepts.html" class="nav-link">Concepts</a>', html_content)
    
    # Remove any other inline styles on nav-links
    html_content = re.sub(r'(<a href="[^"]*" class="nav-link")\s+style="[^"]*"', r'\1', html_content)

    # 3. Handle Rogue {Pages} links inserted by previous script
    # Look for it outside the UL and extract it
    pages_link_match = re.search(r'<a href="[^"]*pages\.html" class="nav-link"[^>]*>\{Pages\}</a>', html_content)
    if pages_link_match:
        full_match = pages_link_match.group(0)
        # Remove it from wherever it is
        html_content = html_content.replace(full_match, "")
        
        # Ensure it exists inside the UL if not already there
        if 'href="pages.html"' not in html_content and 'href="/pages/pages.html"' not in html_content:
            # We'll add it to the links in step 4
            pass

    # 4. Restructure Nav Container
    # We want: <nav class="nav"><div class="nav-container"><div class="nav-start">LOGO + TOGGLE + LINKS</div><div class="nav-end">SEARCH + LOGIN</div></div></nav>
    
    # Find the nav container content
    nav_container_pattern = r'(<div class="nav-container">)(.*?)(</div>\s*</nav>)'
    
    def replacer(match):
        prefix = match.group(1)
        content = match.group(2)
        suffix = match.group(3)
        
        # Split content into parts
        # Logo Usually starts with <a href="..." class="nav-logo">
        # Toggle: <button class="nav-toggle">
        # Links: <ul class="nav-links">
        # Search: <div class="nav-search">
        # User/Login: <button class="login-btn"> or similar
        
        # Try to find the split point (usually after </ul>)
        split_match = re.search(r'</ul>', content)
        if split_match:
            split_pos = split_match.end()
            start_part = content[:split_pos].strip()
            end_part = content[split_pos:].strip()
            
            # Ensure Pages is in the start_part links if we found a rogue one earlier
            if pages_link_match and 'Pages</a>' not in start_part:
                # Calculate relative path based on file depth
                depth = len(Path(file_path).parts) - 1
                rel_pages = "pages.html" if depth > 0 else "pages/pages.html"
                if "pages/" in file_path and depth > 1: rel_pages = "../pages.html"
                
                start_part = re.sub(r'</ul>', f'    <li><a href="{rel_pages}" class="nav-link">Pages</a></li>\n            </ul>', start_part)
            
            return f'{prefix}\n            <div class="nav-start">\n                {start_part}\n            </div>\n            <div class="nav-end">\n                {end_part}\n            </div>\n        {suffix}'
        
        return match.group(0)

    # Apply structural grouping if not already grouped
    if 'class="nav-start"' not in html_content:
        html_content = re.sub(nav_container_pattern, replacer, html_content, flags=re.DOTALL)

    return html_content

def process_all():
    root = "."
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        if any(x in dirpath for x in [".git", ".venv", "__pycache__"]): continue
        for f in filenames:
            if f.endswith(".html"):
                path = os.path.join(dirpath, f)
                with open(path, "r", encoding="utf-8") as file:
                    content = file.read()
                
                new_content = normalize_nav(content, path)
                if new_content != content:
                    with open(path, "w", encoding="utf-8") as file:
                        file.write(new_content)
                    print(f"Fixed: {path}")
                    count += 1
    print(f"Done. Fixed {count} files.")

if __name__ == "__main__":
    process_all()
