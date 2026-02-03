import json
import os

ADMIN_IDS = []

def check_permissions(username, user_id):
    role = 'user'
    auth_permissions = {}
    
    if os.path.exists('permissions.json'):
        try:
            with open('permissions.json', 'r') as f:
                auth_permissions = json.load(f)
            print(f"Loaded permissions: {auth_permissions}")
        except Exception as e:
            print(f"Error loading permissions: {e}")
    
    if user_id in auth_permissions:
        role = auth_permissions[user_id]
        print(f"Matched by ID: {role}")
    elif username in auth_permissions:
        role = auth_permissions[username]
        print(f"Matched by Username: {role}")
    else:
        for key, value in auth_permissions.items():
            if key.lower() == username.lower():
                role = value
                print(f"Matched by Case-Insensitive Username: {role}")
                break
    
    if role == 'user' and (user_id in ADMIN_IDS or username in ADMIN_IDS):
        role = 'admin'
        print("Matched by ADMIN_IDS list")
    
    return role

print("Checking 'baderso'...")
role = check_permissions('baderso', '123456789') # Fake ID
print(f"Resulting Role: {role}")
