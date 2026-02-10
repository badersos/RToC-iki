import urllib.request
import urllib.error
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:8081"

def print_result(test_name, success, details=""):
    mark = "✅" if success else "❌"
    print(f"{mark} {test_name}: {details}")

def test_cors():
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/upload", method="OPTIONS")
        with urllib.request.urlopen(req) as resp:
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
        req = urllib.request.Request(f"{BASE_URL}/api/upload", method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                print_result("Upload JSON Error", False, f"Expected error but got {resp.status}")
        except urllib.error.HTTPError as e:
            # We expect 403 or 400
            try:
                content = e.read().decode('utf-8')
                data = json.loads(content)
                if e.code in [403, 400] and data.get('status') == 'error':
                    print_result("Upload JSON Error", True, f"Got {e.code} JSON: {data}")
                else:
                    print_result("Upload JSON Error", False, f"Got {e.code} but unexpected JSON: {data}")
            except json.JSONDecodeError:
                print_result("Upload JSON Error", False, f"Got {e.code} HTML/Text: {content[:100]}...")
            except Exception as ex:
                print_result("Upload JSON Error", False, f"Error parsing response: {ex}")
    except Exception as e:
        print_result("Upload JSON Error", False, str(e))

def test_permissions_fix():
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/permissions") as resp:
            data = json.loads(resp.read().decode())
            perms = data.get('permissions', {})
            print_result("Permissions GET", True, f"Returned: {perms}")
    except Exception as e:
         print_result("Permissions GET", False, str(e))

if __name__ == "__main__":
    print(f"Testing against {BASE_URL}...")
    try:
        test_cors()
        test_upload_json_error()
        test_permissions_fix()
    except Exception as e:
        print(f"Test suite failed: {e}")
