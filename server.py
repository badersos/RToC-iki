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

PORT = 8081
CLIENT_ID = "1467475613895098472"
CLIENT_SECRET = "W0w_Zzj0his7APvF4COhti3QWsE8LF0k"
# UPDATE THIS URL IF CLOUDFLARE SUBDOMAIN CHANGES
REDIRECT_URI = "https://regressorstaleofcultivation.space/auth/discord/callback"

# === DATABASE & SESSION MANAGER ===
class UserDatabase:
    FILE = 'users.json'
    
    @staticmethod
    def get(user_id):
        if not os.path.exists(UserDatabase.FILE): return None
        try:
            with open(UserDatabase.FILE, 'r') as f:
                users = json.load(f)
            return users.get(str(user_id))
        except: return None

    @staticmethod
    def save(user_data):
        users = {}
        if os.path.exists(UserDatabase.FILE):
            try:
                with open(UserDatabase.FILE, 'r') as f: users = json.load(f)
            except: pass
        
        uid = str(user_data['id'])
        # Preserve existing role if not updating
        existing = users.get(uid, {})
        if 'role' in existing: user_data['role'] = existing['role']
        
        # Sync with permissions.json for role authority
        perms = {}
        if os.path.exists('permissions.json'):
            try:
                with open('permissions.json', 'r') as f: perms = json.load(f)
            except: pass
        
        uname = user_data['username']
        # Priority: permissions.json > existing role > default 'user'
        role = user_data.get('role', 'user')
        
        if uid in perms: role = perms[uid]
        elif uname in perms: role = perms[uname]
        elif str(uid) == '1021410672803844129': role = 'owner' # Hardcoded safety
        
        user_data['role'] = role
        users[uid] = user_data
        
        with open(UserDatabase.FILE, 'w') as f:
            json.dump(users, f, indent=4)
        return user_data

class SessionManager:
    FILE = 'sessions.json'
    
    @staticmethod
    def create(user_id):
        sessions = {}
        if os.path.exists(SessionManager.FILE):
            try:
                with open(SessionManager.FILE, 'r') as f:
                    sessions = json.load(f)
            except:
                pass
            
        session_id = str(uuid.uuid4())
        sessions[session_id] = {'user_id': str(user_id), 'created_at': datetime.now().isoformat()}
        
        with open(SessionManager.FILE, 'w') as f:
            json.dump(sessions, f, indent=4)
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
        
        if not os.path.exists(SessionManager.FILE): return None
        try:
            with open(SessionManager.FILE, 'r') as f: sessions = json.load(f)
            session = sessions.get(session_id)
            if session:
                return UserDatabase.get(session['user_id'])
        except: pass
        return None

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
    def end_headers(self):
        # Avoid stale caching for everything during dev
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        return super().end_headers()

    def send_error(self, code, message=None, explain=None):
        if self.path.startswith('/api/'):
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
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
                permissions = {}
                if os.path.exists('permissions.json'):
                    with open('permissions.json', 'r') as f:
                        permissions = json.load(f)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "permissions": permissions}).encode('utf-8'))
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
                if os.path.exists('comments.json'):
                    try:
                        with open('comments.json', 'r', encoding='utf-8') as f:
                            comments = json.load(f)
                    except: pass

                page_comments = comments.get(page_id, [])
                
                # Migrate logic (simplified for brevity, assume valid structure or frontend handles partials)
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

                profiles = {}
                if os.path.exists('user_profiles.json'):
                    with open('user_profiles.json', 'r') as f:
                        profiles = json.load(f)
                
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

                logs = []
                if os.path.exists('activity_log.json'):
                    with open('activity_log.json', 'r') as f:
                         all_logs = json.load(f)
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
                'scope': 'identify',
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
                
                # Save user to database and get role from permissions
                final_user = UserDatabase.save({
                    'id': user_data['id'],
                    'username': user_data['username'],
                    'avatar': f"https://cdn.discordapp.com/avatars/{user_data['id']}/{user_data['avatar']}.png" if user_data.get('avatar') else None
                })
                
                # Create session
                session_id = SessionManager.create(final_user['id'])
                
                # Also store in base64 for backwards compatibility with frontend
                user_json = json.dumps(final_user)
                b64_user = base64.b64encode(user_json.encode()).decode()
                
                self.send_response(302)
                # Set session cookie (30 days)
                self.send_header('Set-Cookie', f'session={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000')
                self.send_header('Location', f"/?user_data={b64_user}")
                self.end_headers()
                
            except Exception as e:
                print(f"OAuth Error: {e}")
                import traceback
                traceback.print_exc()
                self.send_error(500, f"Authentication Failed: {str(e)}")
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

        super().do_GET()


    def do_POST(self):
        # --- Helper for Auth ---
        def get_authenticated_user(self):
            return SessionManager.get_user(self.headers)
            
        def is_admin(user):
            return user and user.get('role') in ['admin', 'owner']

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
                        
                        logs = []
                        if os.path.exists('activity_log.json'):
                            with open('activity_log.json', 'r') as f:
                                logs = json.load(f)
                        
                        logs.insert(0, log_entry)
                        logs = logs[:1000]
                        
                        with open('activity_log.json', 'w') as f:
                            json.dump(logs, f, indent=4)
                    except: pass

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
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
                
                # Log the deletion
                try:
                    log_entry = {
                        "action": "deleted",
                        "target": file_path,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    logs = []
                    if os.path.exists('activity_log.json'):
                        with open('activity_log.json', 'r') as f:
                            logs = json.load(f)
                    logs.insert(0, log_entry)
                    with open('activity_log.json', 'w') as f:
                        json.dump(logs[:1000], f, indent=4)
                except: pass
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Page deleted"}).encode('utf-8'))
                
            except Exception as e:
                print(f"[DELETE ERROR] {e}")
                self.send_error(500, str(e))

        elif self.path == '/api/profile':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                data = json.loads(post_body)
                
                username = data.get('username')
                if not username:
                    self.send_error(400, "Username required")
                    return

                profiles = {}
                if os.path.exists('user_profiles.json'):
                    with open('user_profiles.json', 'r') as f:
                        profiles = json.load(f)
                
                if username not in profiles:
                    profiles[username] = {}
                
                if 'banner' in data: profiles[username]['banner'] = data['banner']
                if 'bio' in data: profiles[username]['bio'] = data['bio']
                
                with open('user_profiles.json', 'w') as f:
                    json.dump(profiles, f, indent=4)
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path == '/api/permissions':
            try:
                user = get_authenticated_user(self)
                if not is_admin(user):
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

                permissions = {}
                if os.path.exists('permissions.json'):
                    try:
                        with open('permissions.json', 'r') as f:
                            permissions = json.load(f)
                    except: pass
                
                permissions[target_user] = new_role
                with open('permissions.json', 'w') as f:
                    json.dump(permissions, f, indent=4)

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
                comments = {}
                if os.path.exists('comments.json'):
                    try:
                        with open('comments.json', 'r', encoding='utf-8') as f:
                            comments = json.load(f)
                    except: pass
                
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
                
                with open('comments.json', 'w', encoding='utf-8') as f:
                    json.dump(comments, f, indent=4)
                
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
                if os.path.exists('comments.json'):
                    with open('comments.json', 'r', encoding='utf-8') as f:
                        comments = json.load(f)
                
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
                    
                    with open('comments.json', 'w', encoding='utf-8') as f:
                        json.dump(comments, f, indent=4)
                
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
                if os.path.exists('comments.json'):
                    with open('comments.json', 'r', encoding='utf-8') as f:
                        comments = json.load(f)
                
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
                        with open('comments.json', 'w', encoding='utf-8') as f:
                            json.dump(comments, f, indent=4)
                
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
                # User ID from session, not body
                user_id = user['id']
                is_admin_req = is_admin(user)
                
                comments = {}
                if os.path.exists('comments.json'):
                    with open('comments.json', 'r', encoding='utf-8') as f:
                        comments = json.load(f)
                
                success = False
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
                            if comment.get('user_id') == user_id or is_admin_req:
                                comment['is_deleted'] = True
                                comment['content'] = '[This comment has been deleted]'
                                success = True
                            break
                    
                    if success:
                        with open('comments.json', 'w', encoding='utf-8') as f:
                            json.dump(comments, f, indent=4)
                
                self.send_response(200 if success else 403)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success" if success else "error"}).encode('utf-8'))
                
            except Exception as e:
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
                if os.path.exists('comments.json'):
                    with open('comments.json', 'r', encoding='utf-8') as f:
                        comments = json.load(f)
                
                if page_id in comments:
                    for comment in comments[page_id]:
                        if comment.get('id') == comment_id:
                            comment['is_pinned'] = not comment.get('is_pinned', False)
                            break
                    
                    with open('comments.json', 'w', encoding='utf-8') as f:
                        json.dump(comments, f, indent=4)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path == '/upload':
            try:
                user = get_authenticated_user(self)
                if not is_admin(user):
                    self.send_error(403, "Permission denied: Admins only")
                    return

                # Custom multipart parsing to avoid 'cgi' dependency
                content_type = self.headers.get('Content-Type', '')
                if 'multipart/form-data' not in content_type:
                    self.send_error(400, "Content-Type must be multipart/form-data")
                    return
                
                boundary = content_type.split("boundary=")[1].encode()
                content_length = int(self.headers['Content-Length'])
                body = self.rfile.read(content_length)
                
                # Split by boundary
                parts = body.split(b'--' + boundary)
                
                filename = None
                file_content = None
                
                for part in parts:
                    if b'filename="' in part:
                        # Extract filename
                        headers_part, content_part = part.split(b'\r\n\r\n', 1)
                        content_part = content_part.rstrip(b'\r\n')
                        
                        headers = headers_part.decode()
                        import re
                        m = re.search(r'filename="([^"]+)"', headers)
                        if m:
                            filename = m.group(1)
                            file_content = content_part
                            break
                            
                if not filename or not file_content:
                    self.send_error(400, "No file found")
                    return
                
                # Secure filename
                filename = os.path.basename(filename)
                target_dir = os.path.join(os.getcwd(), 'assets', 'images')
                if not os.path.exists(target_dir):
                    os.makedirs(target_dir)
                    
                target_path = os.path.join(target_dir, filename)
                
                with open(target_path, 'wb') as f:
                    f.write(file_content)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success", 
                    "url": f"/assets/images/{filename}",
                    "filename": filename
                }).encode('utf-8'))
                
            except Exception as e:
                print(f"Upload error: {e}")
                self.send_error(500, str(e))

        else:
            self.send_error(404)

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), SaveRequestHandler) as httpd:
        print(f"Starting server at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
