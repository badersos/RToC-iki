#!/usr/bin/env python3
"""
Script to add {Pages} link to all navigation bars in HTML files.
This adds the link next to the login button in all pages.
"""

import os
import re
from pathlib import Path

def update_navigation(html_content, file_path):
    """Update navigation to include {Pages} link."""
    
    # Calculate relative path to pages.html
    path_parts = Path(file_path).parts
    if 'pages' in path_parts:
        # We're in the pages directory
        if path_parts[-2] == 'pages' and path_parts[-1] == 'pages.html':
            # Don't update pages.html itself
            return html_content, False
        
        # Calculate depth
        depth = len([p for p in path_parts if p == 'pages']) - 1
        if 'characters' in path_parts or 'concepts' in path_parts or 'cultivation' in path_parts or 'cycles' in path_parts or 'realms' in path_parts or 'martial_arts' in path_parts:
            pages_link = '../pages.html'
        else:
            pages_link = 'pages.html'
    else:
        # We're in root
        pages_link = 'pages/pages.html'
    
    # Pattern to find login button (various formats)
    patterns = [
        # Pattern 1: Standard format with nav-search before login-btn
        (r'(<div class="nav-search"[^>]*>.*?</div>\s*)<button class="login-btn', 
         rf'\1<a href="{pages_link}" class="nav-link" style="margin-right: 1rem; color: #8B5CF6; font-weight: 600;">{{Pages}}</a>\n            <button class="login-btn'),
        
        # Pattern 2: Login button without nav-search before it
        (r'(</ul>\s*)<div class="nav-search"[^>]*>.*?</div>\s*<button class="login-btn',
         rf'\1<div class="nav-search"[^>]*>.*?</div>\n            <a href="{pages_link}" class="nav-link" style="margin-right: 1rem; color: #8B5CF6; font-weight: 600;">{{Pages}}</a>\n            <button class="login-btn'),
        
        # Pattern 3: Login button directly after nav-search closing
        (r'(</div>\s*)<button class="login-btn',
         rf'\1<a href="{pages_link}" class="nav-link" style="margin-right: 1rem; color: #8B5CF6; font-weight: 600;">{{Pages}}</a>\n            <button class="login-btn'),
    ]
    
    modified = False
    for pattern, replacement in patterns:
        if re.search(pattern, html_content, re.DOTALL):
            # Check if {Pages} link already exists
            if '{Pages}' not in html_content:
                html_content = re.sub(pattern, replacement, html_content, flags=re.DOTALL)
                modified = True
                break
    
    return html_content, modified

def process_html_files(root_dir='.'):
    """Process all HTML files in the directory tree."""
    updated_files = []
    skipped_files = []
    
    for root, dirs, files in os.walk(root_dir):
        # Skip certain directories
        dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', '__pycache__', '.vscode']]
        
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.join(root, file)
                
                # Skip certain files
                if 'template' in file_path.lower() or 'callback' in file_path.lower():
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    new_content, modified = update_navigation(content, file_path)
                    
                    if modified:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        updated_files.append(file_path)
                        print(f"[OK] Updated: {file_path}")
                    else:
                        if '{Pages}' in content:
                            skipped_files.append((file_path, 'already has {Pages} link'))
                        else:
                            skipped_files.append((file_path, 'pattern not found'))
                
                except Exception as e:
                    print(f"[ERROR] Error processing {file_path}: {e}")
    
    print(f"\n{'='*60}")
    print(f"Updated {len(updated_files)} files")
    print(f"Skipped {len(skipped_files)} files")
    if skipped_files:
        print("\nSkipped files:")
        for file_path, reason in skipped_files[:10]:  # Show first 10
            print(f"  - {file_path}: {reason}")
        if len(skipped_files) > 10:
            print(f"  ... and {len(skipped_files) - 10} more")

if __name__ == '__main__':
    print("Updating navigation bars with {Pages} link...")
    print("="*60)
    process_html_files()
    print("\nDone!")

