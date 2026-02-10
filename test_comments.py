import requests
import json
import time

BASE_URL = "http://localhost:8081"

def test_comments():
    print("Testing comments...")
    
    # 1. Post a comment
    payload = {
        "pageId": "test_page_1",
        "user": "test_user",
        "user_id": "12345",
        "content": "This is a test comment",
        "role": "user"
    }
    
    try:
        res = requests.post(f"{BASE_URL}/api/comments", json=payload)
        print(f"Post result: {res.status_code} {res.text}")
        if res.status_code != 200:
            return
            
        comment_id = res.json()['comment']['id']
        print(f"Comment ID: {comment_id}")
        
        # 2. Get comments
        res = requests.get(f"{BASE_URL}/api/comments?pageId=test_page_1")
        print(f"Get result: {res.status_code}")
        comments = res.json()['comments']
        found = any(c['id'] == comment_id for c in comments)
        print(f"Comment found: {found}")
        
        # 3. Edit comment (Mocking auth/permissions might be tricky without a real session, but we can try)
        # Note: The server code checks session or if user_id matches.
        # Since we can't easily set session cookies in this simple script without logging in, 
        # we might hit 403 unless we fake the 'user' object in the server's get_authenticated_user
        # OR we just test the persistence of the POST for now.
        
        # 4. Delete comment
        # Same permission issue.
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_comments()
