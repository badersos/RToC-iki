import os
import sys
import json
import uuid
import datetime

# Supabase SDK
from supabase import create_client, Client

URL = "https://zzpjxsqlhxdqhcybmgy.supabase.co"
KEY = "sb_publishable_zxGFxVUWupq-F03Ed4-SKQ_3judxO00"

print(f"Connecting to Supabase at: {URL}")
supabase: Client = create_client(URL, KEY)

def load_json(filename, default=None):
    if default is None:
        default = {}
    filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), filename)
    if not os.path.exists(filepath):
        print(f"[-] File not found: {filename}")
        return default
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def migrate_users():
    print("\n--- Migrating Users ---")
    users = load_json('users.json')
    if not users:
        return
        
    records = []
    for uid, data in users.items():
        records.append({
            'id': str(uid),
            'username': data.get('username', f"User{uid}"),
            'avatar': data.get('avatar', ''),
            'role': data.get('role', 'user')
        })
        
    for r in records:
        try:
            supabase.table('users').upsert(r).execute()
        except Exception as e:
            print(f"Error upserting user {r['id']}: {e}")
    print(f"[+] Migrated {len(records)} users.")

def migrate_profiles():
    print("\n--- Migrating Profiles ---")
    profiles = load_json('user_profiles.json')
    if not profiles:
        return
        
    records = []
    for username, data in profiles.items():
        records.append({
            'username': username,
            'rank': data.get('rank', 'Outer Disciple'),
            'title': data.get('title', ''),
            'about': data.get('about', '')
            # join_date will default to NOW() if we don't supply it, which is fine since the original JSON rarely stores exact join timestamps
        })
        
    for r in records:
        try:
            supabase.table('user_profiles').upsert(r).execute()
        except Exception as e:
            print(f"Error upserting profile {r['username']}: {e}")
            
    print(f"[+] Migrated {len(records)} profiles.")

def migrate_comments():
    print("\n--- Migrating Comments ---")
    comments = load_json('comments.json')
    if not comments:
        return
        
    records = []
    for page_id, comment_list in comments.items():
        for c in comment_list:
            # Generate a consistent UUID based on the comment text/user or a new one
            c_id = c.get('id', str(uuid.uuid4()))
            if not c_id: c_id = str(uuid.uuid4())
            
            records.append({
                'id': c_id,
                'page_id': page_id,
                'user_id': str(c.get('user_id')),
                'text': c.get('text', ''),
                'created_at': c.get('created_at', datetime.datetime.now(datetime.timezone.utc).isoformat()),
                'is_pinned': c.get('is_pinned', False),
                'likes': c.get('likes', []),
                'dislikes': c.get('dislikes', []),
                'replies': c.get('replies', [])
            })
            
    for r in records:
        try:
            supabase.table('comments').upsert(r).execute()
        except Exception as e:
            # Foreign key errors can happen if the user_id for the comment doesn't exist in the users table
            print(f"Error upserting comment by user {r['user_id']} on {r['page_id']}: {e}")
            
    print(f"[+] Migrated {len(records)} comments.")

def migrate_sessions():
    print("\n--- Migrating Sessions ---")
    sessions = load_json('sessions.json')
    if not sessions:
        return
        
    records = []
    for s_id, data in sessions.items():
        records.append({
            'session_id': s_id,
            'user_id': str(data.get('user_id')),
            'created_at': data.get('created_at', datetime.datetime.now(datetime.timezone.utc).isoformat())
        })
        
    for r in records:
        try:
            supabase.table('sessions').upsert(r).execute()
        except Exception as e:
            print(f"Error upserting session {r['session_id']}: {e}")
            
    print(f"[+] Migrated {len(records)} sessions.")

def migrate_activity_logs():
    print("\n--- Migrating Activity Logs ---")
    # Activity log is a list of objects
    logs = load_json('activity_log.json', default=[])
    if not logs:
        return
        
    records = []
    for log in logs:
        details = log.get('details', {})
        # Handle legacy 'target' field by moving it into details
        if 'target' in log and 'target' not in details:
            details['target'] = log['target']
            
        records.append({
            'user': log.get('user', 'Unknown'),
            'action': log.get('action', ''),
            'type': log.get('type', 'system'),
            'details': details,
            'timestamp': log.get('timestamp', datetime.datetime.now(datetime.timezone.utc).isoformat())
        })
        
    # We can batch insert these
    if records:
        try:
            supabase.table('activity_logs').insert(records).execute()
        except Exception as e:
            print(f"Error inserting logs: {e}")
            
    print(f"[+] Migrated {len(records)} activity logs.")

def migrate_wiki_pages():
    print("\n--- Migrating Wiki Pages ---")
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pages_dir = os.path.join(base_dir, 'pages')
    
    if not os.path.exists(pages_dir):
        print("[-] Pages directory not found.")
        return

    records = []
    # Also include index.html from root
    root_files = ['index.html']
    for rf in root_files:
        p = os.path.join(base_dir, rf)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                records.append({
                    'path': rf,
                    'content': f.read(),
                    'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
                })

    # Crawl pages/ directory
    for root, dirs, files in os.walk(pages_dir):
        for file in files:
            if file.endswith('.html'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, base_dir).replace('\\', '/')
                with open(full_path, 'r', encoding='utf-8') as f:
                    records.append({
                        'path': rel_path,
                        'content': f.read(),
                        'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
                    })

    for r in records:
        try:
            supabase.table('wiki_pages').upsert(r).execute()
        except Exception as e:
            print(f"Error upserting page {r['path']}: {e}")

    print(f"[+] Migrated {len(records)} wiki pages.")

if __name__ == "__main__":
    print("Starting Supabase Migration (Phase 2)...")
    try:
        # Phase 1 Re-sync (optional, but good for completeness)
        migrate_users()
        migrate_profiles()
        migrate_comments()
        migrate_sessions()
        
        # Phase 2 New Migrations
        migrate_activity_logs()
        migrate_wiki_pages()
        
        print("\n\n✅ Migration Complete!")
    except Exception as e:
        print(f"💥 Migration Failed: {e}")
        import traceback
        traceback.print_exc()

