import urllib.request
import json
import time

BASE_URL = 'http://localhost:8081'
PAGE_ID = '/test/page'
SESSION_COOKIE = 'session=31354244-8654-413c-b711-6ee4417a368a'

def make_request(method, endpoint, data=None):
    url = f"{BASE_URL}{endpoint}"
    if data:
        body = json.dumps(data).encode('utf-8')
    else:
        body = None
        
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Cookie', SESSION_COOKIE)
    
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode()) if e.fp else {'message': str(e)}
    except Exception as e:
        return 500, {'message': str(e)}

print("--- 1. Post Comment ---")
status, res = make_request('POST', '/api/comments', {
    "pageId": PAGE_ID,
    "user": "TestUser",
    "user_id": "1021410672803844129", 
    "content": "Persistence Test Comment",
    "role": "admin"
})
print(f"Status: {status}, Response: {res}")

if status == 200:
    comment_id = res['comment']['id']
    print(f"Comment ID: {comment_id}")
    
    print("\n--- 2. Verify Persistence (Get Comments) ---")
    # Wait a bit to ensure write
    time.sleep(0.5)
    status, res = make_request('GET', f'/api/comments?pageId={urllib.parse.quote(PAGE_ID)}')
    print(f"Status: {status}")
    
    comments = res.get('comments', [])
    found = any(c['id'] == comment_id for c in comments)
    print(f"Comment Found in List: {found}")
    
    if found:
        print("\n--- 3. Pin Comment ---")
        status, res = make_request('POST', '/api/comments/pin', {
            "pageId": PAGE_ID,
            "commentId": comment_id
        })
        print(f"Pin Status: {status}, Response: {res}")
        
        print("\n--- 4. Verify Pin ---")
        status, res = make_request('GET', f'/api/comments?pageId={urllib.parse.quote(PAGE_ID)}')
        pinned_comment = next((c for c in res.get('comments', []) if c['id'] == comment_id), {})
        print(f"Is Pinned: {pinned_comment.get('is_pinned')}")

        print("\n--- 5. Delete Comment ---")
        status, res = make_request('POST', '/api/comments/delete', {
            "pageId": PAGE_ID,
            "commentId": comment_id
        })
        print(f"Delete Status: {status}, Response: {res}")

        print("\n--- 6. Verify Deletion ---")
        status, res = make_request('GET', f'/api/comments?pageId={urllib.parse.quote(PAGE_ID)}')
        deleted_comment = next((c for c in res.get('comments', []) if c['id'] == comment_id), {})
        print(f"Is Deleted: {deleted_comment.get('is_deleted')}")
        print(f"Content: {deleted_comment.get('content')}")
        
else:
    print("Failed to post comment, skipping rest.")
