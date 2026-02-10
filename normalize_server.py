
def fix_lines():
    with open('server.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Check if we have excessive blank lines effectively double spacing
    # Simple heuristic: if >50% of lines are empty, and they alternate, it's double spaced.
    
    new_lines = []
    for i, line in enumerate(lines):
        if i > 0 and line.strip() == '' and lines[i-1].strip() != '':
            # This is a blank line following a non-blank line.
            # If the file is systematically double spaced, we might want to skip this.
            # But let's be safer: just remove multiple consecutive blank lines? 
            # Or just read the file, `strip()` check?
            pass
            
    # Better approach: Read the file, `content.replace('\n\n', '\n')` might be too aggressive if genuine blank paragraphs exist.
    # Let's simple remove every odd line if it is empty? No.
    
    # Let's filter out empty lines that appear to be artifacts.
    # Actually, looking at the previous view_file output, it looks like EVERY line is followed by a newline.
    
    normalized = []
    params_seen = False
    
    with open('server.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Standardize endings
    content = content.replace('\r\n', '\n')
    
    # If we have \n\n everywhere, replace with \n
    if content.count('\n\n') > content.count('\n') * 0.4: # simplistic check
        print("Detected double spacing, fixing...")
        content = content.replace('\n\n', '\n')
        
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    fix_lines()
