import json
import uuid
import hashlib
import os
from datetime import datetime

FILE = 'comments.json'

def migrate():
    if not os.path.exists(FILE):
        print("No comments.json found.")
        return

    with open(FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    migrated_count = 0
    
    for page, comments in data.items():
        for i, c in enumerate(comments):
            updated = False
            
            # 1. Add ID
            if 'id' not in c:
                c['id'] = str(uuid.uuid4())
                updated = True
            
            # 2. Add user_id
            if 'user_id' not in c:
                # Create a deterministic ID from username for legacy comments
                c['user_id'] = hashlib.md5(c.get('user', 'anon').encode()).hexdigest()
                updated = True
                
            # 3. Standardize timestamp
            if 'created_at' not in c and 'timestamp' in c:
                c['created_at'] = c['timestamp']
                updated = True
            
            # 4. default fields
            if 'parent_id' not in c:
                c['parent_id'] = None
                updated = True
            if 'likes' not in c:
                c['likes'] = []
                updated = True
            if 'dislikes' not in c:
                c['dislikes'] = []
                updated = True
            if 'is_deleted' not in c:
                c['is_deleted'] = False
                updated = True
            if 'is_pinned' not in c:
                c['is_pinned'] = False
                updated = True

            if updated:
                migrated_count += 1

    with open(FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

    print(f"Migration complete. Updated {migrated_count} comments.")

if __name__ == "__main__":
    migrate()
