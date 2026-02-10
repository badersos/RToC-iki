import os

def fix():
    with open('server.py', 'rb') as f:
        content = f.read()

    # The file has garbage at the end (UTF-16 encoded text likely appended to UTF-8 file)
    # We find the last good line which is inside the "if __name__ == '__main__':" block
    # The last known good line is "            pass" or just before the spaced out content.
    
    # We'll decode as utf-8, ignoring errors for now to process the string
    try:
        text = content.decode('utf-8')
    except:
        # If strict utf-8 fails, we might slice bytes.
        # But let's try to find the split point in string if possible.
        text = content.decode('utf-8', errors='ignore')

    # Find the split point
    split_marker = "if __name__ == '__main__':"
    if split_marker not in text:
        print("Could not find main block")
        return

    # Find the end of the main block
    # It ends with:
    #         try:
    #             httpd.serve_forever()
    #         except KeyboardInterrupt:
    #             pass
    
    end_marker = "            pass"
    end_idx = text.rfind(end_marker)
    if end_idx == -1:
         print("Could not find end of main block")
         return
    
    # Cut off everything after the pass
    clean_text = text[:end_idx + len(end_marker)]
    
    # Now insert FileHandler
    # We want to insert it before "class UserDatabase:"
    insert_marker = "class UserDatabase:"
    if insert_marker not in clean_text:
        print("Could not find UserDatabase class")
        return
        
    file_handler_code = '''
import shutil
import threading
import tempfile

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
'''
    
    parts = clean_text.split(insert_marker)
    new_content = parts[0] + file_handler_code + "\n" + insert_marker + parts[1]
    
    # Also need to make sure imports are there
    if "import shutil" not in new_content:
        # We added them in file_handler_code but they might be better at top. 
        # But top imports are fine or inline imports are fine. 
        # The snippet above includes imports.
        pass

    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Successfully cleaned and updated server.py")

if __name__ == "__main__":
    fix()
