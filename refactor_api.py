
import os
import re

def refactor():
    with open('server.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # --- Refactor /api/comments POST ---
    # Logic: Find the block for '/api/comments' and replace the file handling part
    
    # We will search for the specific file reading block in comments API
    comments_read_pattern = re.compile(r'''# Load existing comments\s+comments = {}\s+if os\.path\.exists\('comments\.json'\):\s+try:\s+with open\('comments\.json', 'r', encoding='utf-8'\) as f:\s+comments = json\.load\(f\)\s+except: pass''', re.DOTALL)
    
    new_comments_read = '''# Load existing comments
                comments = FileHandler.read_json('comments.json')'''
    
    if comments_read_pattern.search(content):
        content = comments_read_pattern.sub(new_comments_read, content)
        print("Updated /api/comments read.")
    else:
        print("Could not find /api/comments read block.")


    # Search for write block in POST /api/comments
    comments_write_pattern = re.compile(r'''with open\('comments\.json', 'w', encoding='utf-8'\) as f:\s+json\.dump\(comments, f, indent=4\)''', re.DOTALL)
    new_comments_write = '''FileHandler.write_json('comments.json', comments)'''
    
    if comments_write_pattern.search(content):
        # This might match multiple places, which is actually good as most writes should be replaced
        # BUT we need to be careful. Let's do it instance by instance if we can, or globally if safe.
        # The structure is standard, so global replacement of this specific block is likely desired.
        content = comments_write_pattern.sub(new_comments_write, content)
        print("Updated /api/comments writes (Global match).")
    else:
        print("Could not find /api/comments write block.")

    # --- Refactor /api/comments/vote ---
    # The read block is slightly different: 
    # if os.path.exists('comments.json'):
    #     with open('comments.json', 'r', encoding='utf-8') as f:
    #         comments = json.load(f)
            
    vote_read_pattern = re.compile(r'''if os\.path\.exists\('comments\.json'\):\s+with open\('comments\.json', 'r', encoding='utf-8'\) as f:\s+comments = json\.load\(f\)''', re.DOTALL)
    new_vote_read = '''comments = FileHandler.read_json('comments.json')'''
    
    if vote_read_pattern.search(content):
        content = vote_read_pattern.sub(new_vote_read, content)
        print("Updated /api/comments/vote read.")

    # --- Refactor /api/comments/edit ---
    
    # --- Refactor /api/comments/delete ---
    
    # --- Refactor /api/comments/pin ---
    
    # For these, the global write replacement above might have covered them if the code pattern was identical. 
    # Let's check for any remaining 'with open(..., 'w'...' patterns that target comments.json
    
    # Also need to handle other file reads (permissions.json etc)
    
    # Permissions read in is_admin helper
    perms_read_pattern = re.compile(r'''if os\.path\.exists\('permissions\.json'\):\s+try:\s+with open\('permissions\.json', 'r'\) as f:\s+perms = json\.load\(f\)''', re.DOTALL)
    # Note: original code might not have explicitly properly identified 'r' or encoding in all places, need to be careful with regex
    
    # Let's look at is_admin specifically
    # ...
    
    # Actually, let's just save what we have as a start. The global write replacement is powerful.
    
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == '__main__':
    refactor()
