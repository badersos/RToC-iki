
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
                print(f"[FILE READ ERROR] {filename}: {e}", file=sys.stderr)
                return default

    @staticmethod
    def write_json(filename, data):
        lock = FileHandler.get_lock(filename)
        with lock:
            try:
                # 1. Write to temp file
                fd, temp_path = tempfile.mkstemp(dir=os.getcwd(), text=True)
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                
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
