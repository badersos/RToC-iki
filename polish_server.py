
import re
import os

def polish():
    with open('server.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update is_admin to use FileHandler for permissions.json
    # Pattern: with open('permissions.json', 'r') as f: \n <indent> perms = json.load(f)
    # We'll just replace the whole permission block in is_admin if we can match it, or simple string replace.
    
    # Simple string replace for the read block might work if indentation matches.
    # The block usually looks like:
    #             with open('permissions.json', 'r') as f:
    #                 perms = json.load(f)
    
    # We can use a regex to find generic permissions.json reads
    
    perm_read_pattern = re.compile(r"if os\.path\.exists\('permissions\.json'\):\s+try:\s+with open\('permissions\.json', 'r'\) as f:\s+perms = json\.load\(f\)", re.DOTALL)
    
    # This might fail due to whitespace. Let's try to match the inner part.
    # "with open('permissions.json', 'r') as f: perms = json.load(f)" 
    # But it involves newlines.
    
    # Let's use a very generic replacer for permissions.json reading
    # We want to replace:
    # with open('permissions.json', 'r') as f:
    #     perms = json.load(f)
    # With:
    # perms = FileHandler.read_json('permissions.json')
    
    # We'll do this by lines to handle indentation.
    lines = content.split('\n')
    new_lines = []
    skip = 0
    
    for i, line in enumerate(lines):
        if skip > 0:
            skip -= 1
            continue
            
        # Check for permissions.json read
        if "with open('permissions.json', 'r') as f:" in line:
            # Check next line for json.load
            if i+1 < len(lines) and "perms = json.load(f)" in lines[i+1]:
                indent = line[:line.find("with")]
                new_lines.append(f"{indent}perms = FileHandler.read_json('permissions.json')")
                skip = 1 # Skip next line
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    content = '\n'.join(new_lines)
    
    # 2. Add startup error handling
    # Replace the main block
    if "if __name__ == '__main__':" in content:
        main_block = """if __name__ == '__main__':
    try:
        # Allow reuse of address to prevent 'Address already in use' errors on quick restarts
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", PORT), SaveRequestHandler) as httpd:
            print(f"Starting server at http://localhost:{PORT}")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                pass
    except Exception as e:
        print(f"FAILED TO START SERVER: {e}")
        import traceback
        traceback.print_exc()"""
        
        # We need to find the old main block and replace it.
        # It ends at end of file.
        start_idx = content.find("if __name__ == '__main__':")
        content = content[:start_idx] + main_block

    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    polish()
