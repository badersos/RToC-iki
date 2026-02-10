
import os
import re

def refactor():
    with open('server.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # --- Robust Regex Patterns ---

    # 1. Replace open(... 'w' ...) blocks for comments.json
    # Matches: with open('comments.json', 'w', encoding='utf-8') as f: \n <indent> json.dump(comments, f, indent=4)
    # We use [\s\S]*? to match across newlines conservatively
    
    write_pattern = re.compile(r"with open\('comments\.json', 'w', encoding='utf-8'\) as f:\s+json\.dump\(comments, f, indent=4\)", re.DOTALL)
    if write_pattern.search(content):
        content = write_pattern.sub("FileHandler.write_json('comments.json', comments)", content)
        print("Replaced comments.json write blocks.")
    else:
        print("No comments.json write blocks found (might already be replaced).")

    # 2. Replace read blocks for comments.json
    # Pattern A: generic load
    # if os.path.exists('comments.json'):
    #    try:
    #        with open('comments.json', 'r', encoding='utf-8') as f:
    #            comments = json.load(f)
    #    except: pass
    
    read_pattern_a = re.compile(r"if os\.path\.exists\('comments\.json'\):\s+try:\s+with open\('comments\.json', 'r', encoding='utf-8'\) as f:\s+comments = json\.load\(f\)\s+except: pass", re.DOTALL)
    
    if read_pattern_a.search(content):
        content = read_pattern_a.sub("comments = FileHandler.read_json('comments.json')", content)
        print("Replaced comments.json read pattern A.")

    # Pattern B: simpler load (used in vote/edit/delete often)
    # if os.path.exists('comments.json'):
    #     with open('comments.json', 'r', encoding='utf-8') as f:
    #         comments = json.load(f)
            
    read_pattern_b = re.compile(r"if os\.path\.exists\('comments\.json'\):\s+with open\('comments\.json', 'r', encoding='utf-8'\) as f:\s+comments = json\.load\(f\)", re.DOTALL)

    if read_pattern_b.search(content):
        content = read_pattern_b.sub("comments = FileHandler.read_json('comments.json')", content)
        print("Replaced comments.json read pattern B.")

    # 3. Replace permissions.json read in is_admin
    # if os.path.exists('permissions.json'):
    #     try:
    #         with open('permissions.json', 'r') as f:
    #             perms = json.load(f)
    #             ...
    
    # This one is tricky because it wraps logic.
    # Let's replace the opening part.
    # Match: if os.path.exists('permissions.json'): <try/except optional> with open('permissions.json', 'r') as f: perms = json.load(f)
    
    # Actually, simpler to just start using FileHandler for the whole block if possible, but the surrounding logic varies.
    # Let's target the specific read lines and remove the file open context.
    
    # We can search for the "with open... as f ... json.load(f)" and replace it with "perms = FileHandler.read_json(...)"
    # But we need to handle indentation.
    
    # Let's just fix the specific occurrence in is_admin manually or via specific context matching if strict.
    # Given the variability, let's stick to the high-value targets (comments) first as requested by the user's issue (persistence).
    
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == '__main__':
    refactor()
