
import requests
import threading
import time
import json
import os
import sys

# Configuration
BASE_URL = 'http://localhost:8081'
COMMENTS_FILE = 'comments.json'

def log(msg):
    print(f"[{threading.current_thread().name}] {msg}")

def test_run():
    # 1. Post a comment
    log("Posting comment...")
    payload = {
        "pageId": "test_page_1",
        "user": "TestUser",
        "user_id": "12345",
        "content": "This is a test comment",
        "role": "user",
        "avatar": "http://example.com/avatar.png"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/api/comments", json=payload)
        if resp.status_code != 200:
            log(f"Failed to post comment: {resp.text}")
            return
            
        comment = resp.json().get('comment')
        if not comment:
            log("No comment returned")
            return
            
        comment_id = comment['id']
        log(f"Comment posted: {comment_id}")
        
        # 2. Verify it exists in file (simulating persistence check)
        # We can't easily check file content from client side script unless we are on same machine.
        # Assuming we are running this on the server machine:
        if os.path.exists(COMMENTS_FILE):
             with open(COMMENTS_FILE, 'r', encoding='utf-8') as f:
                 data = json.load(f)
                 found = any(c['id'] == comment_id for c in data.get('test_page_1', []))
                 if found:
                     log("Persistence Check 1: PASSED (Comment found in file)")
                 else:
                     log("Persistence Check 1: FAILED (Comment not found in file)")
        else:
            log("Persistence Check 1: SKIPPED (File not found)")

        # 3. Concurrent Edits/Votes
        def vote_spam():
            for i in range(5):
                requests.post(f"{BASE_URL}/api/comments/vote", json={
                    "pageId": "test_page_1",
                    "commentId": comment_id,
                    "userId": f"voter_{i}",
                    "voteType": "like"
                })
        
        threads = [threading.Thread(target=vote_spam) for _ in range(3)]
        for t in threads: t.start()
        for t in threads: t.join()
        
        log("Concurrent voting finished.")
        
        # 4. Verify data integrity
        if os.path.exists(COMMENTS_FILE):
             with open(COMMENTS_FILE, 'r', encoding='utf-8') as f:
                 data = json.load(f)
                 # Find our comment
                 tgt = next((c for c in data.get('test_page_1', []) if c['id'] == comment_id), None)
                 if tgt:
                     # We had 3 threads * 5 votes = 15 likes expected? 
                     # Wait, logic is remove then add. If unique users:
                     # voter_0...voter_4 per thread.
                     # Actually threads use same user_ids "voter_{i}".
                     # So user "voter_0" voting "like" again just stays "liked".
                     # So we expect exactly 5 likes (voter_0 to voter_4).
                     like_count = len(tgt.get('likes', []))
                     log(f"Like count: {like_count} (Expected 5)")
                     if like_count == 5:
                         log("Concurrency Check: PASSED")
                     else:
                         log("Concurrency Check: FAILED")
                 else:
                     log("Concurrency Check: FAILED (Comment lost!)")

    except Exception as e:
        log(f"Error: {e}")

if __name__ == '__main__':
    # Ensure server is running before running this test manually
    test_run()
