
import os
import re

def refactor():
    with open('server.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # --- Refactor UserDatabase ---
    # We will use regex to find the class block and replace it.
    # The original UserDatabase block starts at 'class UserDatabase:' and goes until 'class SessionManager:'
    
    user_db_pattern = re.compile(r'class UserDatabase:.*?class SessionManager:', re.DOTALL)
    
    new_user_db = '''class UserDatabase:
    FILE = 'users.json'
    
    @staticmethod
    def get(user_id):
        users = FileHandler.read_json(UserDatabase.FILE)
        return users.get(str(user_id))

    @staticmethod
    def save(user_data):
        users = FileHandler.read_json(UserDatabase.FILE)
        
        uid = str(user_data['id'])
        # Preserve existing role if not updating
        existing = users.get(uid, {})
        if 'role' in existing: user_data['role'] = existing['role']
        
        # Sync with permissions.json for role authority
        perms = FileHandler.read_json('permissions.json')
        
        uname = user_data['username']
        # Priority: permissions.json > existing role > default 'user'
        role = user_data.get('role', 'user')
        
        if uid in perms: role = perms[uid]
        elif uname in perms: role = perms[uname]
        elif str(uid) == '1021410672803844129': role = 'owner' # Hardcoded safety
        
        user_data['role'] = role
        users[uid] = user_data
        
        FileHandler.write_json(UserDatabase.FILE, users)
        return user_data

class SessionManager:'''

    if user_db_pattern.search(content):
        content = user_db_pattern.sub(new_user_db, content)
        print("Updated UserDatabase.")
    else:
        print("Could not find UserDatabase block matches.")

    # --- Refactor SessionManager ---
    # Pattern: class SessionManager: ... until # === HELPER FUNCTIONS ===
    
    session_mgr_pattern = re.compile(r'class SessionManager:.*?# === HELPER FUNCTIONS ===', re.DOTALL)
    
    new_session_mgr = '''class SessionManager:
    FILE = 'sessions.json'
    
    @staticmethod
    def create(user_id):
        sessions = FileHandler.read_json(SessionManager.FILE)
            
        session_id = str(uuid.uuid4())
        sessions[session_id] = {'user_id': str(user_id), 'created_at': datetime.now().isoformat()}
        
        FileHandler.write_json(SessionManager.FILE, sessions)
        return session_id

    @staticmethod
    def get_user(headers):
        cookie_header = headers.get('Cookie')
        if not cookie_header: return None
        
        cookies = {}
        for c in cookie_header.split(';'):
            if '=' in c:
                parts = c.strip().split('=', 1)
                cookies[parts[0]] = parts[1]
        
        session_id = cookies.get('session')
        if not session_id: return None
        
        sessions = FileHandler.read_json(SessionManager.FILE)
        session = sessions.get(session_id)
        if session:
            return UserDatabase.get(session['user_id'])
        return None

# === HELPER FUNCTIONS ==='''

    if session_mgr_pattern.search(content):
        content = session_mgr_pattern.sub(new_session_mgr, content)
        print("Updated SessionManager.")
    else:
        print("Could not find SessionManager block matches.")

    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == '__main__':
    refactor()
