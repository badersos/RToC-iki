import os
from supabase import create_client, Client

SUPABASE_URL = "https://zzpjxsqlhxdqhcybmgy.supabase.co"
SUPABASE_KEY = "sb_publishable_zxGFxVUWupq-F03Ed4-SKQ_3judxO00"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def check_users():
    try:
        response = supabase.table('users').select('*').execute()
        print(f"Users found: {len(response.data)}")
        for user in response.data:
            print(f"ID: {user['id']}, Username: {user['username']}, Role: {user['role']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_users()
