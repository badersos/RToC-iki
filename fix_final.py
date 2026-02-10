
def fix():
    with open('server.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # 1. Fix Indentation in is_admin (around line 182)
        # We look for "perms = FileHandler.read_json('permissions.json')" followed by indented "role ="
        if "perms = FileHandler.read_json('permissions.json')" in line and "is_admin" in "".join(lines[i-15:i]): 
            # This heuristic checks if we are likely in is_admin
            # OR just strictly check if next line is overly indented relative to this one?
            # The current line (182) has indentation 12 spaces (inside try).
            # The next line (183) has indentation 16 spaces (was inside with).
            
            new_lines.append(line)
            
            # Check next lines for excessive indentation
            j = i + 1
            params_indent = len(line) - len(line.lstrip())
            
            while j < len(lines):
                next_line = lines[j]
                next_indent = len(next_line) - len(next_line.lstrip())
                if next_indent > params_indent:
                    # It's indented relative to current line, likely the bug
                    # We want to reduce indentation by 4 spaces (standard python indent)
                    # OR match the current line's indentation? 
                    # Logic: old code was:
                    # with open...:
                    #     block
                    # New code:
                    # cmd
                    # block
                    # So block needs to be dedented one level.
                    
                    # Dedent by 4 spaces
                    if next_line.strip() == "":
                        new_lines.append(next_line)
                    else:
                        new_lines.append(next_line.replace("    ", "", 1))
                    j += 1
                elif next_line.strip() == "except:":
                    # End of try block
                    i = j - 1
                    break
                else:
                    # Indentation matched or less, block ended
                    i = j - 1
                    break
            i += 1
            continue
            
        # 2. Fix permissions check in Delete endpoint (around 1130)
        # if os.path.exists('permissions.json'):
        #     try:
        #         with open('permissions.json', 'r') as f:
        #             perms = json.load(f)
        
        if "if os.path.exists('permissions.json'):" in line and "api/comments/delete" in "".join(lines[i-30:i]):
            # Found the block start.
            # We want to replace the whole `try... except` block or just the read.
            # The structure:
            # if os.path.exists('permissions.json'):
            #     try:
            #         with open('permissions.json', 'r') as f:
            #             perms = json.load(f)
            #             role = ...
            
            # Replaced with:
            # try:
            #      perms = FileHandler.read_json('permissions.json')
            #      role = ...
            
            # Actually, `FileHandler.read_json` handles existence check.
            # So we can remove `if os.path.exists...` entirely?
            # Matches:
            # if os.path.exists('permissions.json'):
            #     try:
            #         with open('permissions.json', 'r') as f:
            #             perms = json.load(f)
            
            # We can replace this chunk.
            
            # Let's simple check if we are in the `with open` line inside that block
            if i+2 < len(lines) and "with open('permissions.json', 'r') as f:" in lines[i+2]:
                 # We are at `if os.path.exists`
                 # verify next lines
                 pass
            
            new_lines.append(line) 
            # Actually, fixing this via generic script is hard due to context.
            # Let's just do a string replacement for the `with open` line again, but looser?
        
        # Let's rely on simple string matching for the Delete endpoint if possible.
        elif "with open('permissions.json', 'r') as f:" in line:
            # This is the line to replace
            indent = line[:line.find("with")]
            new_lines.append(f"{indent}perms = FileHandler.read_json('permissions.json')")
            # Next line (perms = json.load(f)) needs to be skipped
            # And subsequent lines dedented?
            
            # Wait, `perms = FileHandler...` returns the dict.
            # The next line `perms = json.load(f)` sets `perms`.
            # So we replace `with open...` with `perms = ...`
            # AND skip `perms = json.load(f)`
            # AND dedent the subsequent lines.
            
            if i+1 < len(lines) and "json.load(f)" in lines[i+1]:
                # Skip the json.load line
                # Proceed to dedent until block end?
                # This is becoming effectively the same logic as above.
                
                # Logic:
                # Replace `with open...` line with `perms = FileHandler...`
                # Skip `perms = json.load...` line.
                # Dedent following lines until indentation drops back.
                
                # However, in `Delete` endpoint, it's inside `try/except`.
                
                j = i + 2
                while j < len(lines):
                    sub_line = lines[j]
                    sub_indent = len(sub_line) - len(sub_line.lstrip())
                    base_indent = len(indent)
                    
                    if sub_indent > base_indent:
                        # Dedent
                        new_lines.append(sub_line.replace("    ", "", 1))
                        j += 1
                    else:
                        break
                i = j - 1 # Main loop increment will take us to j
            else:
                # Should not happen if structure matches
                new_lines.append(line)
        
        elif "perms = json.load(f)" in line:
             # If we replaced the `with` block above properly, we shouldn't hit this unless we missed it.
             # If we are here, it means we didn't match the `with` correctly or we are processing it now?
             # No, if we matched `with`, we skipped this line.
             new_lines.append(line)

        else:
            new_lines.append(line)
            
        i += 1

    with open('server.py', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == '__main__':
    fix()
