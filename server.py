import http.server
import socketserver
import os
import json
import uuid
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone
import base64
import shutil
import threading
import tempfile

# Configuration - use environment variables for deployment
PORT = int(os.environ.get('PORT', 8081))
CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID', '1467475613895098472')
CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET', 'W0w_Zzj0his7APvF4COhti3QWsE8LF0k')
BOT_TOKEN = os.environ.get('DISCORD_BOT_TOKEN') # MUST set this in Render Environment Variables
GUILD_ID = os.environ.get('DISCORD_GUILD_ID', '1345014093731332108')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'https://regressorstaleofcultivation.space/auth/discord/callback')

# CORS - allowed origins for cross-origin requests
ALLOWED_ORIGINS = [
    'https://regressorstaleofcultivation.space',
    'https://www.regressorstaleofcultivation.space',
    'https://badersos.github.io',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'https://rtoc-iki.onrender.com'
]

from supabase import create_client, Client

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://zzpjxsqlhxdqhcybmgy.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'sb_publishable_zxGFxVUWupq-F03Ed4-SKQ_3judxO00')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# === DATABASE & SESSION MANAGER ===

import shutil
import threading
import tempfile
import subprocess

def git_push(message="Auto-save data"):
    pass # Deprecated by Supabase

# === FILE HANDLER ===
class FileHandler:
    _locks = {}
    _global_lock = threading.Lock()
    @staticmethod
    def get_lock(filename):
        with FileHandler._global_lock:
            if filename not in FileHandler._locks:
                FileHandler._locks[filename] = threading.Lock()
            return FileHandler._locks[filename]
    @staticmethod
    def read_json(filename, default=None):
        if default is None: default = {}
        if not os.path.exists(filename): return default
        
        lock = FileHandler.get_lock(filename)
        with lock:
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                # print(f"[FILE READ ERROR] {filename}: {e}", file=sys.stderr)
                return default
    @staticmethod
    def write_json(filename, data):
        lock = FileHandler.get_lock(filename)
        with lock:
            try:
                # 1. Write to temp file
                fd, temp_path = tempfile.mkstemp(dir=os.getcwd(), text=True)
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4, ensure_ascii=False)
                
                # 2. Atomic rename (replace)
                shutil.move(temp_path, filename)
                return True
            except Exception as e:
                print(f"[FILE WRITE ERROR] {filename}: {e}", file=sys.stderr)
                if 'temp_path' in locals() and os.path.exists(temp_path):
                    try: os.remove(temp_path)
                    except: pass
                return False
    @staticmethod
    def read_text(filename):
        if not os.path.exists(filename): return None
        lock = FileHandler.get_lock(filename)
        with lock:
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    return f.read()
            except:
                return None
    @staticmethod
    def write_text(filename, content):
        lock = FileHandler.get_lock(filename)
        with lock:
            try:
                fd, temp_path = tempfile.mkstemp(dir=os.getcwd(), text=True)
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    f.write(content)
                shutil.move(temp_path, filename)
                return True
            except:
                return False
class UserDatabase:
    @staticmethod
    def get(user_id):
        try:
            response = supabase.table('users').select('*').eq('id', str(user_id)).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            print(f"[DB] Error getting user {user_id}: {e}", file=sys.stderr)
            return None
            
    @staticmethod
    def save(user_data):
        uid = str(user_data['id'])
        uname = user_data.get('username', '')
        
        # Check if user exists to preserve role
        existing_user = UserDatabase.get(uid)
        
        # Determine initial role
        role = user_data.get('role', 'user')
        
        # 1. Check permissions.json (Static Config)
        try:
            static_perms = FileHandler.read_json('permissions.json')
            if uname in static_perms:
                role = static_perms[uname]
                print(f"[DB] Role for {uname} found in permissions.json: {role}")
        except Exception as e:
            print(f"[DB] Error reading permissions.json: {e}")
            pass

        # 2. Preserve existing DB role if it exists and wasn't overridden by static config
        if existing_user and 'role' in existing_user and role == 'user':
            role = existing_user['role']
            
        # Hardcoded owner check (ID or Username)
        if uid == '1021410672803844129' or uname.lower() == 'baderso':
            role = 'owner'
            
        final_data = {
            'id': uid,
            'username': uname,
            'avatar': user_data.get('avatar', ''),
            'role': role
        }
        
        try:
            supabase.table('users').upsert(final_data).execute()
        except Exception as e:
            print(f"[DB] Error saving user {uid}: {e}", file=sys.stderr)
            
        return final_data
class SessionManager:
    @staticmethod
    def create(user_id):
        session_id = str(uuid.uuid4())
        session_data = {
            'session_id': session_id,
            'user_id': str(user_id),
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        try:
            supabase.table('sessions').insert(session_data).execute()
        except Exception as e:
            print(f"[DB] Error creating session: {e}", file=sys.stderr)
        return session_id
    @staticmethod
    def get_user(headers):
        session_id = None
        
        # 1. Try Authorization header first (works cross-origin)
        auth_header = headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            session_id = auth_header[7:].strip()
            print(f"[AUTH] Found Bearer Token: {session_id[:8]}...")
        
        # 2. Fallback to cookie (works same-origin)
        if not session_id:
            cookie_header = headers.get('Cookie')
            if cookie_header:
                cookies = {}
                for c in cookie_header.split(';'):
                    if '=' in c:
                        parts = c.split('=', 1)
                        cookies[parts[0].strip()] = parts[1].strip()
                session_id = cookies.get('session')
                if session_id:
                    print(f"[AUTH] Found Cookie Session: {session_id[:8]}...")
        
        if not session_id: 
            print("[AUTH] No session ID found in headers/cookies")
            return None
        
        try:
            response = supabase.table('sessions').select('*').eq('session_id', session_id).execute()
            if response.data:
                user_id = response.data[0]['user_id']
                user = UserDatabase.get(user_id)
                if user:
                    print(f"[AUTH] Session valid for user: {user.get('username')} ({user_id})")
                else:
                    print(f"[AUTH] Session points to non-existent user: {user_id}")
                return user
            else:
                print(f"[AUTH] Session ID not found in database: {session_id[:8]}...")
        except Exception as e:
            print(f"[DB] Error verifying session: {e}", file=sys.stderr)
            
        return None
# === HELPER FUNCTIONS ===
def get_authenticated_user(request_handler):
    """Get the authenticated user from the request's session cookie or Authorization header."""
    return SessionManager.get_user(request_handler.headers)

def is_admin(user):
    """Check if a user has admin or owner role."""
    if not user:
        print("[ADMIN CHECK] Failed: User object is None")
        return False
    
    uid = str(user.get('id', ''))
    uname = str(user.get('username', '')).lower()
    role = str(user.get('role', 'user')).lower()
    
    # Hardcoded owner check (ID or Username)
    if uid == '1021410672803844129' or uname == 'baderso':
        print(f"[ADMIN CHECK] Success: Owner match ({uname})")
        return True
    
    # Role-based check
    if role in ['admin', 'owner']:
        print(f"[ADMIN CHECK] Success: Role match ({role}) for {uname}")
        return True
        
    print(f"[ADMIN CHECK] Denied for {uname} (ID: {uid}, Role: {role})")
    return False

from html.parser import HTMLParser
import re

# === SEARCH INDEXER ===
class SearchIndexer:
    _instance = None
    
    def __init__(self):
        self.index = [] # List of {path, title, content, headers}
        self.is_indexed = False
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def index_all(self, root_dir):
        print("Building Search Index...", file=sys.stderr)
        self.index = []
        for root, _, files in os.walk(root_dir):
            for file in files:
                if file.endswith('.html'):
                    path = os.path.join(root, file)
                    rel_path = os.path.relpath(path, root_dir).replace('\\', '/')
                    
                    # Skip administrative/hidden pages if needed
                    if 'node_modules' in rel_path or '.git' in rel_path:
                        continue
                        
                    try:
                        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            self.parse_and_add(rel_path, content)
                    except Exception as e:
                        print(f"Failed to index {rel_path}: {e}", file=sys.stderr)
        
        self.is_indexed = True
        print(f"Search Index Built: {len(self.index)} pages indexed.", file=sys.stderr)

    def parse_and_add(self, path, html_content):
        parser = TextExtractor()
        parser.feed(html_content)
        
        self.index.append({
            'path': path,
            'title': parser.title,
            'headers': parser.headers,
            'content': parser.get_body_text()
        })

    def search(self, query, limit=10):
        if not self.is_indexed:
            self.index_all(os.getcwd())
            
        terms = query.lower().split()
        results = []
        
        for page in self.index:
            score = 0
            
            # 1. Title Match (High Priority)
            title_lower = page['title'].lower() if page['title'] else ""
            if query.lower() in title_lower:
                score += 20
            
            for term in terms:
                if term in title_lower:
                    score += 10
            
            # 2. Header Match (Medium Priority)
            for header in page['headers']:
                header_lower = header.lower()
                for term in terms:
                    if term in header_lower:
                        score += 5
            
            # 3. Content Match (Low Priority)
            content_lower = page['content'].lower()
            term_matches = 0
            for term in terms:
                if term in content_lower:
                    score += 1
                    term_matches += 1
            
            # Boost if all terms are present
            if term_matches == len(terms):
                score += 5
                
            if score > 0:
                snippet = self.get_snippet(page['content'], terms)
                results.append({
                    'path': page['path'],
                    'name': page['title'] or os.path.basename(page['path']),
                    'score': score,
                    'snippet': snippet
                })
        
        # Sort by score desc
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]

    def get_snippet(self, content, terms, window_size=60):
        content_lower = content.lower()
        best_pos = -1
        
        # Find the first occurrence of the rarest term (heuristic)
        # For simplicity, distinct occurrence of first term
        if not terms: return content[:100] + "..."
        
        # Try to find a cluster of terms
        positions = []
        for term in terms:
            pos = content_lower.find(term)
            if pos != -1: positions.append(pos)
            
        if not positions:
            return content[:100] + "..."
            
        start_pos = min(positions)
        start = max(0, start_pos - window_size)
        end = min(len(content), start_pos + window_size + 20)
        
        text = content[start:end]
        if start > 0: text = "..." + text
        if end < len(content): text = text + "..."
        
        return text

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.headers = []
        self.text_parts = []
        self.in_title = False
        self.in_header = False
        self.ignore_tags = {'script', 'style', 'nav', 'footer'}
        self.current_tag = None
        
    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        if tag == 'title':
            self.in_title = True
        elif tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            self.in_header = True
            
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        elif tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            self.in_header = False
        self.current_tag = None

    def handle_data(self, data):
        if self.current_tag in self.ignore_tags:
            return
            
        clean_data = ' '.join(data.split())
        if not clean_data: return
        
        if self.in_title:
            self.title = clean_data
        elif self.in_header:
            self.headers.append(clean_data)
        else:
            self.text_parts.append(clean_data)

    def get_body_text(self):
        return " ".join(self.text_parts)


class SaveRequestHandler(http.server.SimpleHTTPRequestHandler):
    def get_cors_origin(self):
        """Get the appropriate CORS origin header based on request origin."""
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            return origin
        return ALLOWED_ORIGINS[0]  # Default to main domain

    def send_cors_headers(self):
        """Send CORS headers for cross-origin requests."""
        self.send_header('Access-Control-Allow-Origin', self.get_cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PUT')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')

    def do_OPTIONS(self):
        """Handle preflight CORS requests."""
        self.send_response(200)
        self.send_header('Content-Length', '0')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def end_headers(self):
        # CORS and cache headers
        self.send_cors_headers()
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        return super().end_headers()

    def send_error(self, code, message=None, explain=None):
        if self.path.startswith('/api/') or self.path == '/save':
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()  # This calls send_cors_headers internally
            response = {'status': 'error', 'message': message, 'code': code}
            self.wfile.write(json.dumps(response).encode())
        else:
            super().send_error(code, message, explain)


    def do_GET(self):
        print(f"DEBUG: GET request for {self.path}", file=sys.stderr)

        # API: Health Check (wake-up ping for Render free tier cold starts)
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return

        # API: Search
        if self.path.startswith('/api/search'):
            try:
                query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                q = query_params.get('q', [''])[0]
                limit = int(query_params.get('limit', [10])[0])
                
                indexer = SearchIndexer.get_instance()
                results = indexer.search(q, limit)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "results": results}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        # API: Get Current User (Session Check)
        if self.path == '/api/user/me':
            user = SessionManager.get_user(self.headers)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            if user:
                self.wfile.write(json.dumps({"status": "success", "user": user}).encode())
            else:
                self.wfile.write(json.dumps({"status": "error", "message": "Not logged in"}).encode())
            return
        
        # API: Logout
        if self.path == '/auth/logout':
            self.send_response(302)
            self.send_header('Set-Cookie', 'session=; Path=/; Max-Age=0')
            self.send_header('Location', '/')
            self.end_headers()
            return

        # API: Get all permissions
        if self.path == '/api/permissions':
            try:
                # Merge logic: Static JSON + Supabase Users
                perms = FileHandler.read_json('permissions.json', default={})
                
                try:
                    db_users = supabase.table('users').select('username, role').execute()
                    if db_users.data:
                        for row in db_users.data:
                            uname = row.get('username')
                            urole = row.get('role')
                            if uname and uname not in perms:
                                perms[uname] = urole
                except Exception as db_err:
                    print(f"[PERMISSIONS GET] Supabase fetch error: {db_err}")

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "permissions": perms}).encode('utf-8'))
            except Exception as e:
                print(f"[PERMISSIONS GET] Error: {e}")
                self.send_error(500, str(e))
            return

        if self.path.startswith('/api/comments'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                page_id = params.get('pageId', [None])[0]
                sort_by = params.get('sort', ['newest'])[0] 
                
                try:
                    response = supabase.table('comments').select('*').eq('page_id', page_id).execute()
                    page_comments = response.data or []
                except Exception as e:
                    print(f"[DB] Error fetching comments: {e}")
                    page_comments = []
                
                # Sort comments based on requested order, with PINNED comments always on top
                if sort_by == 'oldest':
                    # Pinned first (False < True for 'not is_pinned'), then oldest (small timestamp)
                    page_comments.sort(key=lambda c: (not c.get('is_pinned', False), c.get('created_at', '')))
                elif sort_by == 'top':
                    # Pinned first (True > False), then highest score
                    page_comments.sort(key=lambda c: (c.get('is_pinned', False), len(c.get('likes', [])) - len(c.get('dislikes', []))), reverse=True)
                else:  # newest (default)
                     # Pinned first (True > False), then newest (large timestamp)
                    page_comments.sort(key=lambda c: (c.get('is_pinned', False), c.get('created_at', '')), reverse=True)
                
                # Fetch latest user data (username, avatar, role) for comments
                try:
                    users_response = supabase.table('users').select('id, username, avatar, role').execute()
                    users_map = {row['id']: row for row in (users_response.data or [])}
                    for c in page_comments:
                        # Map text -> content for frontend compatibility
                        c['content'] = c.get('text', '')
                        
                        uid = c.get('user_id')
                        if uid and uid in users_map:
                            u_info = users_map[uid]
                            c['user'] = u_info.get('username', 'Unknown')
                            c['avatar'] = u_info.get('avatar')
                            c['role'] = u_info.get('role', 'user')
                        else:
                            # Fallback for anonymous or missing users
                            c['user'] = c.get('user', 'Anonymous')
                except Exception as e:
                    print(f"[DB] Error fetching user data for comments: {e}")

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success", 
                    "comments": page_comments,
                    "total": len(page_comments)
                }).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return
        
        # API: Profile Management
        if self.path.startswith('/api/profile'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                username = params.get('user', [None])[0]
                try:
                    response = supabase.table('user_profiles').select('*').eq('username', username).execute()
                    if response.data:
                        user_profile = response.data[0]
                        # Map 'about' to 'bio' for frontend compatibility if needed, 
                        # but migrate_to_supabase.py used 'about'.
                        user_profile['bio'] = user_profile.get('about', '')
                    else:
                        user_profile = {}
                except Exception as e:
                    print(f"[DB] Error fetching profile: {e}")
                    user_profile = {}
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "profile": user_profile
                }).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        # API: Activity
        if self.path.startswith('/api/activity'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                username = params.get('user', [None])[0]

                try:
                    if username:
                        response = supabase.table('activity_logs').select('*').eq('user', username).order('timestamp', desc=True).limit(50).execute()
                    else:
                        response = supabase.table('activity_logs').select('*').order('timestamp', desc=True).limit(50).execute()
                    logs = response.data or []
                except Exception as e:
                    print(f"[DB] Error fetching activity {e}")
                    logs = []
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "activity": logs}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        # Discord Auth
        if self.path == '/auth/discord/login':
            params = {
                'client_id': CLIENT_ID,
                'redirect_uri': REDIRECT_URI,
                'response_type': 'code',
                'scope': 'identify guilds.join',
            }
            url = f"https://discord.com/api/oauth2/authorize?{urllib.parse.urlencode(params)}"
            self.send_response(302)
            self.send_header('Location', url)
            self.end_headers()
            return
            
        elif self.path.startswith('/auth/discord/callback'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                code = params.get('code', [None])[0]
                
                if not code:
                    self.send_error(400, "No code provided")
                    return

                data = urllib.parse.urlencode({
                    'client_id': CLIENT_ID,
                    'client_secret': CLIENT_SECRET,
                    'grant_type': 'authorization_code',
                    'code': code,
                    'redirect_uri': REDIRECT_URI
                }).encode()
                
                req = urllib.request.Request(
                    "https://discord.com/api/oauth2/token", 
                    data=data, 
                    headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DiscordBot'}
                )
                with urllib.request.urlopen(req) as res:
                    token_data = json.loads(res.read().decode())
                    access_token = token_data['access_token']

                req_user = urllib.request.Request(
                    "https://discord.com/api/users/@me", 
                    headers={'Authorization': f"Bearer {access_token}", 'User-Agent': 'DiscordBot'}
                )
                with urllib.request.urlopen(req_user) as res_user:
                    user_data = json.loads(res_user.read().decode())
                
                # --- AUTO-JOIN SERVER ---
                try:
                    if BOT_TOKEN and GUILD_ID:
                        join_url = f"https://discord.com/api/guilds/{GUILD_ID}/members/{user_data['id']}"
                        join_data = json.dumps({'access_token': access_token}).encode()
                        join_req = urllib.request.Request(
                            join_url,
                            data=join_data,
                            method='PUT',
                            headers={
                                'Authorization': f"Bot {BOT_TOKEN}",
                                'Content-Type': 'application/json',
                                'User-Agent': 'DiscordBot'
                            }
                        )
                        # We don't strictly need to check the response, but it's good practice.
                        # 201 Created = Joined, 204 No Content = Already joined
                        with urllib.request.urlopen(join_req) as join_res:
                            print(f"Auto-join status: {join_res.status}")
                except Exception as e:
                    print(f"Auto-join failed: {e}")
                # ------------------------

                # Save user to database and get role from permissions
                if user_data.get('avatar'):
                    ext = 'gif' if user_data['avatar'].startswith('a_') else 'png'
                    avatar_url = f"https://cdn.discordapp.com/avatars/{user_data['id']}/{user_data['avatar']}.{ext}"
                else:
                    try:
                        index = (int(user_data['id']) >> 22) % 6
                    except:
                        index = 0
                    avatar_url = f"https://cdn.discordapp.com/embed/avatars/{index}.png"

                final_user = UserDatabase.save({
                    'id': user_data['id'],
                    'username': user_data['username'],
                    'avatar': avatar_url
                })
                
                # Create session
                session_id = SessionManager.create(final_user['id'])
                
                # Check if client wants JSON (API call from callback.html)
                accept_header = self.headers.get('Accept', '')
                if 'application/json' in accept_header:
                    # API response for cross-origin callback
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Set-Cookie', f'session={session_id}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "success",
                        "user": final_user,
                        "session_id": session_id
                    }).encode())
                else:
                    # Traditional redirect for direct browser access
                    user_json = json.dumps(final_user)
                    b64_user = base64.b64encode(user_json.encode()).decode()
                    
                    self.send_response(302)
                    self.send_header('Set-Cookie', f'session={session_id}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000')
                    self.send_header('Location', f"/?user_data={b64_user}&session_id={session_id}")
                    self.end_headers()

                # Persist session & user data to git so they survive Render restarts
                try:
                    supabase.table('activity_logs').insert({
                        "user": final_user.get('username', 'unknown'),
                        "action": "logged in",
                        "type": "system",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }).execute()
                except: pass
                
            except Exception as e:
                print(f"OAuth Error: {e}")
                import traceback
                traceback.print_exc()
                self.send_error(500, f"Authentication Failed: {str(e)}")
            return

        # Dev Login (Localhost only)
        if self.path == '/api/dev/login' and not os.environ.get('RENDER'):
            user_data = {"id": "dev-admin-id", "username": "DevAdmin", "role": "owner", "avatar": None}
            # Create session
            session_id = SessionManager.create(user_data['id'])
            # Save user
            UserDatabase.save(user_data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Set-Cookie', f'session={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000')
            self.end_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success", 
                "user": user_data, 
                "session_id": session_id,
                "message": "Dev login successful"
            }).encode())
            return

        # API: List all pages
        if self.path.startswith('/api/pages'):
            try:
                pages = []
                for root, dirs, files in os.walk(os.getcwd()):
                    dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
                    for file in files:
                        if file.endswith('.html'):
                            rel_path = os.path.relpath(os.path.join(root, file), os.getcwd())
                            pages.append({"path": rel_path.replace('\\', '/'), "name": file})
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "pages": pages}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return

        # API: List all assets
        if self.path.startswith('/api/assets'):
            try:
                target_dir = os.path.join(os.getcwd(), 'assets', 'images')
                assets = []
                if os.path.exists(target_dir):
                    for f in os.listdir(target_dir):
                        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                            assets.append({"filename": f, "url": f"/assets/images/{f}"})
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "assets": assets}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return

        # Serve static files (HTML, CSS, JS, images, etc.)
        # Handle root path by serving index.html
        if self.path == '/':
            self.path = '/index.html'
        
        # Phase 2: Intercept HTML pages to serve from Supabase
        clean_path = self.path
        if '?' in clean_path: clean_path = clean_path.split('?')[0]
        if clean_path.startswith('/'): clean_path = clean_path[1:]
        
        if clean_path.endswith('.html'):
            try:
                response = supabase.table('wiki_pages').select('content').eq('path', clean_path).execute()
                if response.data:
                    content = response.data[0]['content']
                    # make sure editor script is present so admins can toggle edit
                    if 'editor.js' not in content:
                        if '</body>' in content.lower():
                            # similar injection logic as in save handler
                            lower = content.lower()
                            idx = lower.rfind('</body>')
                            if idx != -1:
                                content = content[:idx] + '<script src="/scripts/editor.js"></script>\n' + content[idx:]
                        else:
                            content += '\n<script src="/scripts/editor.js"></script>'
                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.end_headers()
                    self.wfile.write(content.encode('utf-8'))
                    return
            except Exception as e:
                print(f"[DB] Error serving page {clean_path} from Supabase: {e}")

            # If we reach here it means either the page isn't in Supabase or an error
            # occurred fetching it.  We'll try to serve the local file ourselves and
            # perform the same editor-script injection.
            try:
                file_path = os.path.normpath(os.path.join(os.getcwd(), clean_path))
                if os.path.isfile(file_path):
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    if 'editor.js' not in content:
                        if '</body>' in content.lower():
                            lower = content.lower()
                            idx = lower.rfind('</body>')
                            if idx != -1:
                                content = content[:idx] + '<script src="/scripts/editor.js"></script>\n' + content[idx:]
                        else:
                            content += '\n<script src="/scripts/editor.js"></script>'

                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.end_headers()
                    self.wfile.write(content.encode('utf-8'))
                    return
            except Exception as e:
                print(f"[INJECT] Error reading local file {clean_path}: {e}")
        
        super().do_GET()


    def do_POST(self):
        if self.path == '/save':
            try:
                user = get_authenticated_user(self)
                print(f"[SAVE] POST /save authenticated user: {user}")
                
                if not is_admin(user):
                    print(f"[SAVE] Admin check failed for user: {user}")
                    self.send_error(403, f"Permission denied: Admins only. Current user: {user.get('username') if user else 'Guest'}")
                    return

                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                relative_path = data.get('file')
                content = data.get('content')
                user_info = data.get('user')

                if not relative_path or content is None:
                    self.send_error(400, "Missing 'file' or 'content'")
                    return
                
                if relative_path.startswith('/'): relative_path = relative_path[1:]
                safe_path = os.path.normpath(os.path.join(os.getcwd(), relative_path))
                
                # Case-insensitive check for Windows compatibility
                if not safe_path.lower().startswith(os.getcwd().lower()):
                    print(f"[SAVE] Access denied: {safe_path} not in {os.getcwd()}")
                    self.send_error(403, "Access denied")
                    return

                # Ensure saved pages always include the editor script.
                if 'editor.js' not in content:
                    if '</body>' in content.lower():
                        lower = content.lower()
                        idx = lower.rfind('</body>')
                        if idx != -1:
                            content = content[:idx] + '<script src="/scripts/editor.js"></script>\n' + content[idx:]
                    else:
                        content = content + '\n<script src="/scripts/editor.js"></script>'

                # Ensure directory exists for nested pages
                os.makedirs(os.path.dirname(safe_path), exist_ok=True)

                with open(safe_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                # Phase 2: Persist page to Supabase
                old_content = None
                try:
                    # Fetch existing content for diff logging
                    old_res = supabase.table('wiki_pages').select('content').eq('path', relative_path).execute()
                    if old_res.data:
                        old_content = old_res.data[0].get('content')

                    supabase.table('wiki_pages').upsert({
                        'path': relative_path,
                        'content': content,
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).execute()
                except Exception as e:
                    print(f"[DB] Error saving page to Supabase: {e}")

                # Activity Log
                if user_info:
                    try:
                        log_entry = {
                            "user": user_info.get('username', 'Unknown'),
                            "action": "edited",
                            "type": "page",
                            "details": {
                                "target": relative_path,
                                "old_content": old_content,
                                "new_content": content
                            },
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        supabase.table('activity_logs').insert(log_entry).execute()
                    except: pass

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, f"Server error: {str(e)}")

        # API: Delete Page
        elif self.path == '/api/pages/delete':
            try:
                user = get_authenticated_user(self)
                if not is_admin(user):
                    self.send_error(403, "Permission denied: Admins only")
                    return

                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                file_path = data.get('path', '')
                
                # Security: normalize and validate path
                if file_path.startswith('/'):
                    file_path = file_path[1:]
                
                # Protected pages that cannot be deleted
                protected = ['index.html', 'pages/characters.html']
                if any(file_path.endswith(p) for p in protected):
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Cannot delete protected page"}).encode('utf-8'))
                    return
                
                safe_path = os.path.normpath(os.path.join(os.getcwd(), file_path))
                
                # Security: must be within project directory
                if not safe_path.startswith(os.getcwd()):
                    self.send_error(403, "Access denied")
                    return
                
                # Check file exists
                if not os.path.exists(safe_path):
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "File not found"}).encode('utf-8'))
                    return
                
                # Delete the file
                os.remove(safe_path)
                print(f"[DELETE] Deleted file: {safe_path}")
                
                # Phase 2: Delete from Supabase
                try:
                    supabase.table('wiki_pages').delete().eq('path', file_path).execute()
                except Exception as e:
                    print(f"[DB] Error deleting page from Supabase: {e}")

                # Log the deletion
                try:
                    log_entry = {
                        "user": user.get('username', 'Admin'),
                        "action": "deleted",
                        "type": "system",
                        "details": {"target": file_path},
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    supabase.table('activity_logs').insert(log_entry).execute()
                except: pass
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Page deleted"}).encode('utf-8'))
                
            except Exception as e:
                print(f"[DELETE ERROR] {e}")
                self.send_error(500, str(e))

        # API: Upload File (for banners)
        elif self.path == '/api/upload':
            try:
                # Authentication Check
                user = get_authenticated_user(self)
                if not user:
                    print("[UPLOAD] Access denied: No user logged in")
                    self.send_error(403, "Login required")
                    return

                content_type = self.headers.get('Content-Type', '')
                if 'multipart/form-data' not in content_type:
                    self.send_error(400, "Content-Type must be multipart/form-data")
                    return

                try:
                   boundary = content_type.split("boundary=")[1].encode()
                   print(f"[UPLOAD] Boundary found: {boundary.decode()}")
                except IndexError:
                    print(f"[UPLOAD] Error: Missing boundary in content-type: {content_type}")
                    self.send_error(400, "Invalid Content-Type: missing boundary")
                    return

                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                
                # Robust multipart parsing
                # Parts are separated by b'--' + boundary
                parts = body.split(b'--' + boundary)
                
                found_filename = None
                file_content = None
                
                for part in parts:
                    # Skip empty parts or end guard
                    if not part or part == b'--\r\n': continue
                    
                    if b'filename="' in part:
                        # Header/Body separator is \r\n\r\n
                        split_idx = part.find(b'\r\n\r\n')
                        if split_idx == -1: continue
                        
                        headers = part[:split_idx].decode('utf-8', errors='ignore')
                        # Content follows headers + 4 bytes (\r\n\r\n)
                        # And usually ends with \r\n before the next boundary
                        raw_content = part[split_idx+4:]
                        
                        # Remove trailing \r\n which is part of multipart framing, not the file
                        if raw_content.endswith(b'\r\n'):
                            raw_content = raw_content[:-2]
                            
                        import re
                        m = re.search(r'filename="([^"]+)"', headers)
                        if m:
                            found_filename = m.group(1)
                            file_content = raw_content
                            break
                            
                if found_filename and file_content:
                    # Determine extension
                    ext = os.path.splitext(found_filename)[1].lower()
                    if not ext: ext = '.png'
                    
                    # Generate unique filename
                    new_filename = f"{uuid.uuid4()}{ext}"
                    
                    # Ensure directory exists
                    upload_dir = os.path.join(os.getcwd(), 'assets', 'uploads')
                    os.makedirs(upload_dir, exist_ok=True)
                    
                    file_path = os.path.join(upload_dir, new_filename)
                    with open(file_path, 'wb') as f:
                        f.write(file_content)
                
                    try:
                        log_entry = {
                            "user": user.get('username', 'Unknown'),
                            "action": "uploaded",
                            "type": "asset",
                            "details": {"target": new_filename},
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        supabase.table('activity_logs').insert(log_entry).execute()
                    except: pass
                    
                    # Return URL consistent with serving path
                    file_url = f"/assets/uploads/{new_filename}"
                    print(f"[UPLOAD] Success: {file_url}")
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "url": file_url}).encode())
                else:
                    print("[UPLOAD] Error: No file found in parsing")
                    self.send_error(400, "No file found")

            except Exception as e:
                print(f"[UPLOAD ERROR] {e}")
                import traceback
                traceback.print_exc()
                self.send_error(500, str(e))

        elif self.path == '/api/profile':
            try:
                user = get_authenticated_user(self)
                if not user:
                    self.send_error(403, "Login required")
                    return

                content_len = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_len)
                data = json.loads(post_data.decode('utf-8'))
                
                target_username = data.get('username')
                if not target_username:
                    self.send_error(400, "Username required")
                    return

                # Security: Only allow user to edit their OWN profile, or admin
                if not is_admin(user) and user.get('username') != target_username:
                    self.send_error(403, "Permission denied")
                    return

                # Prepare profile data
                profile_update = {}
                if 'bio' in data: profile_update['about'] = data['bio']
                if 'about' in data: profile_update['about'] = data['about']
                if 'banner' in data: profile_update['banner'] = data['banner']
                if 'rank' in data: profile_update['rank'] = data['rank']
                if 'title' in data: profile_update['title'] = data['title']

                supabase.table('user_profiles').upsert({
                    "username": target_username,
                    **profile_update
                }).execute()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Profile updated"}).encode())

            except Exception as e:
                print(f"[PROFILE POST ERROR] {e}")
                self.send_error(500, str(e))

        # === COMMENTS API ===
        elif self.path == '/api/comments':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                page_id = data.get('pageId')
                user = data.get('user')
                user_id = data.get('user_id')
                content = data.get('content')
                parent_id = data.get('parent_id')
                role = data.get('role', 'user')
                avatar = data.get('avatar')
                
                if not page_id or not content or not user:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Missing required fields"}).encode('utf-8'))
                    return
                
                # Database handling done in try block below
                pass
                
                # Sanitize user_id: If "anonymous" or obviously invalid, set to None for Null in DB
                if user_id == 'anonymous' or not (user_id and str(user_id).isdigit()):
                    user_id = None
                
                # Check if user exists, otherwise Lazy Sync
                if user_id:
                    user_record = UserDatabase.get(user_id)
                    if not user_record and user:
                        print(f"[DB] Lazy Sync: Creating missing user {user} ({user_id})")
                        UserDatabase.save({
                            'id': user_id,
                            'username': user,
                            'avatar': avatar,
                            'role': role
                        })

                # Create new comment
                new_comment = {
                    "id": str(uuid.uuid4()),
                    "page_id": page_id,
                    "user_id": user_id,
                    "parent_id": parent_id, # Added missing parent_id
                    "text": content,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_pinned": False,
                    "likes": [],
                    "dislikes": [],
                    "replies": []
                }
                
                try:
                    supabase.table('comments').insert(new_comment).execute()
                except Exception as e:
                    print(f"[DB ERROR] Failed to insert comment into 'comments' table: {e}")
                    # Log more details if possible
                    if hasattr(e, 'message'): print(f"  Details: {e.message}")
                    self.send_error(500, f"Database error (Check logs for details)")
                    return
                
                # Fetch user data to return fully populated comment to frontend
                user_record = UserDatabase.get(user_id)
                frontend_comment = {
                    **new_comment,
                    "user": user, # Username from request
                    "role": role,
                    "avatar": user_record.get('avatar') if user_record else avatar,
                    "parent_id": parent_id,
                    "is_deleted": False
                }
                
                # We need to map 'text' to 'content' for the frontend
                frontend_comment['content'] = frontend_comment['text']
            
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "comment": frontend_comment}).encode('utf-8'))
                
            except Exception as e:
                print(f"[COMMENT POST ERROR] {e}")
                self.send_error(500, str(e))

        elif self.path == '/api/comments/vote':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                page_id = data.get('pageId')
                comment_id = data.get('commentId')
                user_id = data.get('userId')
                vote_type = data.get('voteType')  # 'like' or 'dislike'
                
                try:
                    response = supabase.table('comments').select('*').eq('id', comment_id).execute()
                    if not response.data:
                        self.send_response(404)
                        self.end_headers()
                        return
                        
                    comment = response.data[0]
                    likes = comment.get('likes', [])
                    dislikes = comment.get('dislikes', [])
                    
                    # Remove from both first
                    if user_id in likes: likes.remove(user_id)
                    if user_id in dislikes: dislikes.remove(user_id)
                    
                    # Add to appropriate list
                    if vote_type == 'like':
                        likes.append(user_id)
                    elif vote_type == 'dislike':
                        dislikes.append(user_id)
                        
                    supabase.table('comments').update({'likes': likes, 'dislikes': dislikes}).eq('id', comment_id).execute()
                    
                except Exception as e:
                    print(f"[DB] Error voting on comment: {e}")
                    self.send_error(500, "Database error")
                    return
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path == '/api/comments/edit':
            try:
                user = get_authenticated_user(self)
                if not user:
                    self.send_error(401, "Login required")
                    return

                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                page_id = data.get('pageId')
                comment_id = data.get('commentId')
                user_id = data.get('userId')
                new_content = data.get('content')
                # Trust is_admin only from server side check
                is_admin_req = is_admin(user)
                
                success = False
                try:
                    response = supabase.table('comments').select('*').eq('id', comment_id).execute()
                    if response.data:
                        comment = response.data[0]
                        if comment.get('user_id') == user['id'] or is_admin_req:
                            supabase.table('comments').update({
                                'text': new_content
                            }).eq('id', comment_id).execute()
                            success = True
                except Exception as e:
                    print(f"[DB] Error editing comment: {e}")
                    
                self.send_response(200 if success else 403)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success" if success else "error", "message": "Permission denied" if not success else None}).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path == '/api/comments/delete':
            try:
                user = get_authenticated_user(self)
                if not user:
                    self.send_error(401, "Login required")
                    return

                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                page_id = data.get('pageId')
                comment_id = data.get('commentId')
                user_id = user['id']
                
                # Robust Admin Check: Using existing is_admin helper
                is_admin_req = is_admin(user)

                try:
                    response = supabase.table('comments').select('*').eq('id', comment_id).execute()
                    if response.data:
                        comment = response.data[0]
                        if comment.get('user_id') == str(user_id) or is_admin_req:
                            supabase.table('comments').update({
                                'text': '[This comment has been deleted]',
                                'is_deleted': True
                            }).eq('id', comment_id).execute()
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                            return
                            
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Permission denied"}).encode('utf-8'))
                    return
                except Exception as e:
                    print(f"[DB] Error deleting comment: {e}")
                    self.send_error(500, "Database error")
                    return
                    
            except Exception as e:
                print(f"[DELETE ERROR] {e}")
                self.send_error(500, str(e))

        elif self.path == '/api/comments/pin':
            try:
                user = get_authenticated_user(self)
                if not is_admin(user):
                    self.send_error(403, "Permission denied")
                    return

                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                page_id = data.get('pageId')
                comment_id = data.get('commentId')
                # Admin check already done above
                
                if False: # Removed previous client-trust check
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Admin required"}).encode('utf-8'))
                    return
                
                try:
                    response = supabase.table('comments').select('*').eq('id', comment_id).execute()
                    if response.data:
                        comment = response.data[0]
                        new_pin_status = not comment.get('is_pinned', False)
                        
                        supabase.table('comments').update({
                            'is_pinned': new_pin_status
                        }).eq('id', comment_id).execute()
                        
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                        return
                        
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Comment not found"}).encode('utf-8'))
                except Exception as e:
                    print(f"[DB] Error pinning comment: {e}")
                    self.send_error(500, "Database error")
                
            except Exception as e:
                self.send_error(500, str(e))


        else:
            self.send_error(404)

if __name__ == '__main__':
    try:
        # Ensure assets directory exists
        if not os.path.exists('assets/uploads'):
            os.makedirs('assets/uploads')

        # Allow reuse of address to prevent 'Address already in use' errors on quick restarts
        socketserver.TCPServer.allow_reuse_address = True

        with socketserver.TCPServer(("", PORT), SaveRequestHandler) as httpd:
            print(f"Server started at http://localhost:{PORT}")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nShutting down server...")
                httpd.server_close()
    except Exception as e:
        print(f"FAILED TO START SERVER: {e}")
        import traceback
        traceback.print_exc()