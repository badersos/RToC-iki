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

# === DATABASE & SESSION MANAGER ===

import shutil
import threading
import tempfile
import subprocess

# === GIT PERSISTENCE (Free Tier Hack) ===
def setup_git():
    """Configure git with the token for pushing."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print("[GIT] No GITHUB_TOKEN found. Persistence disabled.")
        return

    # Create .netrc file for authentication (more robust than URL embedding)
    netrc_path = os.path.expanduser('~/.netrc')
    try:
        with open(netrc_path, 'w') as f:
            f.write(f"machine github.com login badersos password {token}")
        
        # Securing .netrc (optional but good practice)
        try:
            os.chmod(netrc_path, 0o600)
        except:
            pass
            
        print(f"[GIT] Configured .netrc at {netrc_path}", file=sys.stderr)
    except Exception as e:
        print(f"[GIT] Failed to create .netrc: {e}", file=sys.stderr)

    # Use standard URL for .netrc
    repo_url = "https://github.com/badersos/RToC-iki.git"
    
    try:
        # Configure user for commits
        subprocess.run(["git", "config", "user.email", "bot@rtoc-wiki.com"], check=False)
        subprocess.run(["git", "config", "user.name", "RToC Wiki Bot"], check=False)
        
        # Make sure git uses .netrc
        subprocess.run(["git", "config", "--global", "credential.helper", "store"], check=False) # Fallback

        # Set remote URL
        subprocess.run(["git", "remote", "set-url", "origin", repo_url], check=True, stderr=subprocess.PIPE)
        print("[GIT] Remote configured.", file=sys.stderr)
        
    except subprocess.CalledProcessError as e:
        print(f"[GIT] Setup failed: {e.stderr.decode()}", file=sys.stderr)
        # Fallback to URL token if .netrc fails? 
        # Actually let's just print the error for now to diagnose.
    except Exception as e:
        print(f"[GIT] Setup failed: {e}", file=sys.stderr)

def git_pull():
    """Pull latest data from remote on startup to restore persisted data."""
    if not os.environ.get('RENDER') or not os.environ.get('GITHUB_TOKEN'):
        print("[GIT] Skipping pull (not on Render or no token).")
        return
    try:
        # Fetch and reset to remote to handle any force-pushes or conflicts
        print(f"[GIT] Fetching origin...", file=sys.stderr)
        subprocess.run(["git", "fetch", "origin"], check=True, stderr=subprocess.PIPE)
        print(f"[GIT] Resetting to origin/main...", file=sys.stderr)
        subprocess.run(["git", "reset", "--hard", "origin/main"], check=True, stderr=subprocess.PIPE)
        print("[GIT] Pulled latest data from remote.", file=sys.stderr)
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if e.stderr else str(e)
        print(f"[GIT] Pull failed: {err}", file=sys.stderr)
    except Exception as e:
        print(f"[GIT] Pull failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()

def git_status():
    """Get current git status for debugging."""
    try:
        status = subprocess.run(["git", "status"], capture_output=True, text=True).stdout
        log = subprocess.run(["git", "log", "-1"], capture_output=True, text=True).stdout
        return f"Status:\n{status}\n\nLast Log:\n{log}"
    except Exception as e:
        return f"Error getting status: {e}"

# Debounced git push — batches rapid writes into a single push
_push_timer = None
_push_lock = threading.Lock()

def git_push(message="Auto-save data"):
    """Commit and push changes to remote (debounced, 10s delay)."""
    if not os.environ.get('RENDER') or not os.environ.get('GITHUB_TOKEN'):
        return

    global _push_timer

    def _do_push():
        global _push_timer
        try:
            subprocess.run(["git", "add", "."], check=True)
            result = subprocess.run(["git", "commit", "-m", message], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"[GIT] Pushing...", file=sys.stderr)
                # Push current HEAD to remote main branch (handles detached HEAD state)
                subprocess.run(["git", "push", "origin", "HEAD:main"], check=True, stderr=subprocess.PIPE)
                print(f"[GIT] Pushed: {message}", file=sys.stderr)
            else:
                print(f"[GIT] Nothing to commit.", file=sys.stderr)
        except subprocess.CalledProcessError as e:
            err = e.stderr.decode() if e.stderr else str(e)
            print(f"[GIT] Push failed (CalledProcessError): {err}", file=sys.stderr)
        except Exception as e:
            print(f"[GIT] Push failed: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        finally:
            with _push_lock:
                _push_timer = None
    
    with _push_lock:
        # Cancel any pending push and reschedule
        if _push_timer is not None:
            _push_timer.cancel()
        _push_timer = threading.Timer(10.0, _do_push)
        _push_timer.daemon = True
        _push_timer.start()

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
class SessionManager:
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
# === HELPER FUNCTIONS ===
def get_authenticated_user(request_handler):
    """Get the authenticated user from the request's session cookie."""
    return SessionManager.get_user(request_handler.headers)

def is_admin(user):
    """Check if a user has admin or owner role."""
    if not user:
        return False
    
    user_id = str(user.get('id', ''))
    username = user.get('username', '')
    
    # Hardcoded owner ID
    if user_id == '1021410672803844129':
        return True
    
    # Check permissions.json for role
    if os.path.exists('permissions.json'):
        try:
            perms = FileHandler.read_json('permissions.json')
            role = perms.get(user_id) or perms.get(username)
            if role in ['admin', 'owner']:
                return True
        except:
            pass
    
    # Fallback to user object's role
    return user.get('role') in ['admin', 'owner']

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Credentials', 'true')

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
        if self.path.startswith('/api/'):
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()  # This calls send_cors_headers internally
            response = {'status': 'error', 'message': message, 'code': code}
            self.wfile.write(json.dumps(response).encode())
        else:
            super().send_error(code, message, explain)


    def do_GET(self):
        print(f"DEBUG: GET request for {self.path}", file=sys.stderr)

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
                perms = FileHandler.read_json('permissions.json')
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "permissions": perms}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return

        if self.path.startswith('/api/comments'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                page_id = params.get('pageId', [None])[0]
                sort_by = params.get('sort', ['newest'])[0] 
                
                comments = {}
                comments = FileHandler.read_json('comments.json')

                page_comments = comments.get(page_id, [])
                
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
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
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

                profiles = FileHandler.read_json('user_profiles.json')
                
                user_profile = profiles.get(username, {})
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "profile": user_profile}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        # API: Activity
        if self.path.startswith('/api/activity'):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                username = params.get('user', [None])[0]

                all_logs = FileHandler.read_json('activity_log.json', default=[])
                if username:
                    logs = [l for l in all_logs if l.get('user') == username]
                else:
                    logs = all_logs
                
                logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
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
                avatar_url = None
                if user_data.get('avatar'):
                    ext = 'gif' if user_data['avatar'].startswith('a_') else 'png'
                    avatar_url = f"https://cdn.discordapp.com/avatars/{user_data['id']}/{user_data['avatar']}.{ext}"

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
                        "user": final_user
                    }).encode())
                else:
                    # Traditional redirect for direct browser access
                    user_json = json.dumps(final_user)
                    b64_user = base64.b64encode(user_json.encode()).decode()
                    
                    self.send_response(302)
                    self.send_header('Set-Cookie', f'session={session_id}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000')
                    self.send_header('Location', f"/?user_data={b64_user}")
                    self.end_headers()
                
            except Exception as e:
                print(f"OAuth Error: {e}")
                import traceback
                traceback.print_exc()
                self.send_error(500, f"Authentication Failed: {str(e)}")
            return
        
        # API: Debug Git (Admin only)
        if self.path == '/api/debug/git':
            user = get_authenticated_user(self)
            if not is_admin(user):
                self.send_error(403, "Admins only")
                return
                
            status_output = git_status()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(status_output.encode())
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
            self.wfile.write(json.dumps({"status": "success", "user": user_data, "message": "Dev login successful"}).encode())
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
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "assets": assets}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return

        # Only serve static files when NOT running on Render (i.e., local development)
        # UNLESS it's an asset file (uploads/images) which we must serve
        if not os.environ.get('RENDER') or self.path.startswith('/assets/'):
            super().do_GET()
        else:
            # API-only mode on Render - return 404 for non-API routes
            self.send_error(404, "Not Found")


    def do_POST(self):
        if self.path == '/save':
            try:
                user = get_authenticated_user(self)
                if not is_admin(user):
                    self.send_error(403, "Permission denied: Admins only")
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
                
                if not safe_path.startswith(os.getcwd()):
                    self.send_error(403, "Access denied")
                    return

                with open(safe_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                # Activity Log
                if user_info:
                    try:
                        log_entry = {
                            "user": user_info.get('username', 'Unknown'),
                            "user_id": user_info.get('id'),
                            "action": "edited",
                            "target": relative_path,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        
                        logs = FileHandler.read_json('activity_log.json', default=[])
                        logs.insert(0, log_entry)
                        logs = logs[:1000]
                        FileHandler.write_json('activity_log.json', logs)
                    except: pass

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))

                git_push(f"Page edit: {relative_path}")
                
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
                
                # Log the deletion
                try:
                    log_entry = {
                        "action": "deleted",
                        "target": file_path,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    logs = FileHandler.read_json('activity_log.json', default=[])
                    logs.insert(0, log_entry)
                    logs = logs[:1000]
                    FileHandler.write_json('activity_log.json', logs)
                except: pass
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Page deleted"}).encode('utf-8'))

                git_push(f"Page deleted: {file_path}")
                
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
                except IndexError:
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
                
                    git_push(f"Upload asset: {new_filename}")
                    
                    # Return URL consistent with serving path
                    file_url = f"/assets/uploads/{new_filename}"
                    print(f"[UPLOAD] Success: {file_url}")
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
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
                print(f"[PROFILE UPDATE] Request received")
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                print(f"[PROFILE UPDATE] Data: {data}")
                
                username = data.get('username')
                if not username:
                    print(f"[PROFILE UPDATE] Error: Username required")
                    self.send_error(400, "Username required")
                    return

                profiles = FileHandler.read_json('user_profiles.json')
                
                if username not in profiles:
                    profiles[username] = {}
                
                if 'banner' in data: profiles[username]['banner'] = data['banner']
                if 'bio' in data: profiles[username]['bio'] = data['bio']
                
                FileHandler.write_json('user_profiles.json', profiles)

                git_push(f"Profile update: {username}")
                    
                print(f"[PROFILE UPDATE] Success for {username}")
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                print(f"[PROFILE UPDATE] Error: {e}")
                self.send_error(500, str(e))

        elif self.path == '/api/permissions':
            try:
                print(f"[PERMISSIONS POST] Request received")
                user = get_authenticated_user(self)
                print(f"[PERMISSIONS POST] User: {user}")
                admin_check = is_admin(user)
                print(f"[PERMISSIONS POST] is_admin: {admin_check}")
                if not admin_check:
                    print(f"[PERMISSIONS POST] Permission denied for user: {user}")
                    self.send_error(403, "Permission denied: Admins only")
                    return

                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                target_user = data.get('username') or data.get('id')
                new_role = data.get('role')
                if not target_user or not new_role:
                    self.send_error(400, "Missing target user or role")
                    return

                permissions = FileHandler.read_json('permissions.json')
                permissions[target_user] = new_role
                FileHandler.write_json('permissions.json', permissions)
            
                git_push(f"Update permissions: {target_user} -> {new_role}")
            
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))

            except Exception as e:
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
                
                # Load existing comments
                comments = FileHandler.read_json('comments.json')
                
                if page_id not in comments:
                    comments[page_id] = []
                
                # Create new comment
                new_comment = {
                    "id": str(uuid.uuid4()),
                    "user": user,
                    "user_id": user_id,
                    "content": content,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "parent_id": parent_id,
                    "role": role,
                    "avatar": avatar,
                    "likes": [],
                    "dislikes": [],
                    "is_deleted": False,
                    "is_pinned": False
                }
                
                comments[page_id].append(new_comment)
                FileHandler.write_json('comments.json', comments)
            
                git_push(f"New comment on {page_id}")
            
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "comment": new_comment}).encode('utf-8'))
                
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
                
                comments = {}
                comments = FileHandler.read_json('comments.json')
                
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
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
                            
                            comment['likes'] = likes
                            comment['dislikes'] = dislikes
                            break
                    
                    FileHandler.write_json('comments.json', comments)
                    git_push(f"Vote on comment {comment_id}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
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
                
                comments = {}
                comments = FileHandler.read_json('comments.json')
                
                success = False
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
                            # Check permission
                            if comment.get('user_id') == user['id'] or is_admin_req:
                                comment['content'] = new_content
                                comment['updated_at'] = datetime.now(timezone.utc).isoformat()
                                success = True
                            break
                    
                    if success:
                        FileHandler.write_json('comments.json', comments)
                        git_push(f"Edited comment {comment_id}")
                
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
                
                # Robust Admin Check: Read directly from permissions.json
                is_admin_req = False
                if os.path.exists('permissions.json'):
                    try:
                        perms = FileHandler.read_json('permissions.json')
                        role = perms.get(str(user_id)) or perms.get(user['username'])
                        if role in ['admin', 'owner']:
                            is_admin_req = True
                        # Fallback to hardcoded owner
                        if str(user_id) == '1021410672803844129': 
                            is_admin_req = True
                    except: pass

                comments = {}
                comments = FileHandler.read_json('comments.json')
                
                success = False
                found = False
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
                            found = True
                            # Allow if owner of comment OR admin
                            if comment.get('user_id') == user_id or is_admin_req:
                                comment['is_deleted'] = True
                                comment['content'] = '[This comment has been deleted]'
                                success = True
                            break
                    
                    if success:
                        FileHandler.write_json('comments.json', comments)
                        git_push(f"Deleted comment {comment_id}")
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                elif found:
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Permission denied"}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Comment not found"}).encode('utf-8'))
                    
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
                
                comments = {}
                comments = FileHandler.read_json('comments.json')
                
                success = False
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
                            comment['is_pinned'] = not comment.get('is_pinned', False)
                            success = True
                            break
                    
                    if success:
                        FileHandler.write_json('comments.json', comments)
                        git_push(f"Pin comment {comment_id}")
                
                self.send_response(200 if success else 403)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success" if success else "error", "message": "Permission denied" if not success else None}).encode('utf-8'))
                
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

        # Setup Git for persistence and restore data
        setup_git()
        git_pull()  # Restore data from GitHub before serving

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