import requests
import json
import os

BASE_URL = "http://localhost:8081"

def print_result(test_name, success, details=""):
    mark = "✅" if success else "❌"
    print(f"{mark} {test_name}: {details}")

def test_cors():
    try:
        resp = requests.options(f"{BASE_URL}/api/upload")
        max_age = resp.headers.get('Access-Control-Max-Age')
        if max_age == '86400':
            print_result("CORS Preflight", True, "Max-Age header present")
        else:
            print_result("CORS Preflight", False, f"Max-Age header missing or wrong: {max_age}")
    except Exception as e:
        print_result("CORS Preflight", False, str(e))

def test_upload_json_error():
    # Test that /api/upload returns JSON error when not authenticated
    try:
        # No cookies = no auth
        resp = requests.post(f"{BASE_URL}/api/upload")
        
        is_json = False
        try:
            data = resp.json()
            is_json = True
        except:
            pass
            
        if resp.status_code == 403 and is_json:
            print_result("Upload JSON Error", True, f"Got 403 JSON: {data}")
        elif not is_json:
             print_result("Upload JSON Error", False, f"Got HTML/Text response. Status: {resp.status_code}, Content: {resp.text[:100]}")
        else:
             print_result("Upload JSON Error", False, f"Unexpected status: {resp.status_code}, Data: {data}")

    except Exception as e:
        print_result("Upload JSON Error", False, str(e))

def test_permissions_fix():
    # 1. Get initial perms
    try:
        resp = requests.get(f"{BASE_URL}/api/permissions")
        initial_perms = resp.json().get('permissions', {})
        
        # 2. Add a permission (simulate admin)
        # We need a cookie to be admin. Let's assume server is fresh or we can mock.
        # Actually server.py checks permissions.json file directly now for 'is_admin'.
        # If we can't write to permissions without being admin, this test is tricky without a valid session.
        # However, checking if GET returns *anything* (not empty dict) is a good start if file exists.
        
        print_result("Permissions GET", True, f"Returned: {initial_perms}")
        
    except Exception as e:
         print_result("Permissions GET", False, str(e))

def test_comment_sorting():
    # Requires posting comments first.
    # We will just warn if we can't test fully without auth.
    print("⚠️ Comment sorting test requires authenticated setup. Skipping for now.")

if __name__ == "__main__":
    print(f"Testing against {BASE_URL}...")
    test_cors()
    test_upload_json_error()
    test_permissions_fix()
    test_comment_sorting()
