// Admin Editor Functionality
class WikiEditor {
    constructor() {
        this.isEditorActive = false;
        this.originalLayoutHTML = '';
        this.isAdmin = false;
        this.currentUser = null;
        this.currentEditingImage = null;
        this.contextMenuTarget = null;

        // Start initialization
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }

        // Listen for login events from main.js
        window.addEventListener('RToCUserUpdated', (e) => {
            console.log("[WikiEditor] User update event received");
            if (e.detail) this.currentUser = e.detail;
            this.reinit();
        });
    }

    async init() {
        console.log("[WikiEditor] Initializing...");

        // ALWAYS create the context menu (check admin on click)
        this.createContextMenuUI();
        this.initContextMenu();

        // Check admin from SERVER first
        await this.checkAdminFromServer();

        if (this.isAdmin) {
            this.createEditorUI();
            this.createModalUI();
            this.attachEventListeners();
            this.slashMenu = new SlashMenu(this);
            this.initAutosave();
            console.log("[WikiEditor] ✓ Admin UI initialized for:", this.currentUser?.username);
        } else {
            console.log("[WikiEditor] Not admin yet. Context menu ready. Polling for changes...");
        }

        // Keep checking every 3 seconds
        if (!this.pollingInterval) {
            this.pollingInterval = setInterval(async () => {
                const wasAdmin = this.isAdmin;
                await this.checkAdminFromServer();
                if (this.isAdmin && !wasAdmin) {
                    console.log("[WikiEditor] Admin status detected! Initializing...");
                    this.reinit();
                }
            }, 3000);
        }
    }

    async checkAdminFromServer() {
        let serverChecked = false;
        try {
            // First try server session
            const res = await window.rtocFetch('/api/user/me');
            const data = await res.json();

            if (data.status === 'success' && data.user) {
                serverChecked = true;
                this.currentUser = data.user;
                const role = data.user.role;
                const username = data.user.username?.toLowerCase();
                const userId = data.user.id;

                // Check if admin/owner OR specific user override
                if (role === 'admin' || role === 'owner' ||
                    username === 'baderso' ||
                    userId === '1021410672803844129') {
                    this.isAdmin = true;
                    console.log("[WikiEditor] Server confirmed admin:", data.user.username, "Role:", role);
                    return;
                } else {
                    this.isAdmin = false;
                    console.log("[WikiEditor] Server confirmed NON-admin:", data.user.username);
                }
            }
        } catch (e) {
            console.log("[WikiEditor] Server check failed, trying localStorage...");
        }

        // Fallback to localStorage ONLY if server check failed (offline or error)
        if (!serverChecked) {
            this.checkAdminFromLocalStorage();
        }
    }

    checkAdminFromLocalStorage() {
        try {
            const userStr = localStorage.getItem('rtoc_user');
            if (!userStr) {
                this.isAdmin = false;
                return;
            }

            const user = JSON.parse(userStr);
            this.currentUser = user;

            const role = user.role;
            const username = user.username?.toLowerCase();
            const userId = user.id;

            if (role === 'admin' || role === 'owner' ||
                username === 'baderso' ||
                userId === '1021410672803844129') {
                this.isAdmin = true;
                console.log("[WikiEditor] LocalStorage confirmed admin:", user.username);
            } else {
                this.isAdmin = false;
            }
        } catch (e) {
            console.error("[WikiEditor] Error checking localStorage:", e);
            this.isAdmin = false;
        }
    }

    async reinit() {
        await this.checkAdminFromServer();
        if (this.isAdmin) {
            if (!document.getElementById('adminEditor')) {
                this.createEditorUI();
                this.createContextMenuUI();
                this.createModalUI();
                this.attachEventListeners();
                this.initContextMenu();
                this.slashMenu = new SlashMenu(this);
                this.initAutosave();

                // Also init helpers if they exist
                if (typeof SectionEditor !== 'undefined') this.sectionEditor = new SectionEditor(this);
                if (typeof ImageEditor !== 'undefined') this.imageEditor = new ImageEditor(this);

                console.log("[WikiEditor] Re-initialized successfully for:", this.currentUser?.username);
            }
        }
    }

    initAutosave() {
        // Check for existing draft
        const draft = localStorage.getItem('wiki_autosave_' + window.location.pathname);
        if (draft) {
            this.showNotification('Unsaved draft found! <button id="restoreDraftBtn" style="background:transparent; border:1px solid #fff; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.8rem; cursor:pointer; margin-left:5px;">Restore</button>', 'info');
            setTimeout(() => {
                const btn = document.getElementById('restoreDraftBtn');
                if (btn) btn.onclick = () => {
                    document.documentElement.innerHTML = draft;
                    this.showNotification('Draft Restored', 'success');
                    // Re-init editor since DOM replaced
                    new WikiEditor();
                };
            }, 100);
        }

        // Auto-save loop
        setInterval(() => {
            if (this.isEditorActive) {
                const currentContent = document.documentElement.outerHTML;
                localStorage.setItem('wiki_autosave_' + window.location.pathname, currentContent);
                this.showNotification('Autosaved', 'info');
            }
        }, 30000); // 30s
    }

    // Add to createEditorUI toolbar:
    // <button class="editor-btn" id="editSource" title="Edit Source Code"><ion-icon name="code-slash-outline"></ion-icon></button>

    editSource() {
        if (!this.isEditorActive) return;

        // precise current content
        const content = document.documentElement.outerHTML;

        // Show modal with textarea
        const modal = document.createElement('div');
        modal.className = 'admin-modal active';
        modal.id = 'sourceEditorModal';
        modal.innerHTML = `
            <div class="modal-content" style="width: 800px; height: 80vh; display: flex; flex-direction: column;">
                <h3>Edit Source Code</h3>
                <textarea id="sourceCodeArea" style="flex: 1; background: #0f0f13; color: #ccc; font-family: monospace; padding: 10px; border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 8px; resize: none;">${content}</textarea>
                <div class="modal-actions">
                    <button id="cancelSourceBtn" class="btn-secondary">Cancel</button>
                    <button id="saveSourceBtn" class="btn-primary">Apply Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('cancelSourceBtn').onclick = () => modal.remove();
        document.getElementById('saveSourceBtn').onclick = () => {
            const newContent = document.getElementById('sourceCodeArea').value;
            // Basic validation
            if (newContent.length < 100) {
                alert('Content too short, ignoring.');
                return;
            }
            document.open();
            document.write(newContent);
            document.close();
            modal.remove();
            // Re-init
            setTimeout(() => window.location.reload(), 100);
        };
    }

    checkAdmin() {
        try {
            const userStr = localStorage.getItem('rtoc_user');
            console.log("[WikiEditor] Checking admin. LocalStorage:", userStr);

            const user = JSON.parse(userStr || 'null');

            // Explicit override for owner (Username or ID)
            if (user && (
                (user.username && user.username.toLowerCase() === 'baderso') ||
                (user.id === '1021410672803844129')
            )) {
                console.log("[WikiEditor] User identified as Owner (ID/Name Match).");
                this.isAdmin = true;
                user.role = 'owner'; // Ensure role matches
            } else {
                this.isAdmin = (user && (user.role === 'admin' || user.role === 'owner'));
            }

            if (!this.isAdmin) {
                console.log("[WikiEditor] User is not admin. Role:", user ? user.role : 'none');
            } else {
                console.log("[WikiEditor] Admin mode enabled. Role:", user.role);
            }
        } catch (e) {
            console.error("[WikiEditor] Error checking admin:", e);
            this.isAdmin = false;
        }
    }

    createEditorUI() {
        const editorHTML = `
            <div class="admin-editor" id="adminEditor">
                <style>
                    /* Tooltip Styles */
                    .editor-btn {
                        position: relative;
                    }
                    .editor-btn[data-tooltip]:hover::after {
                        content: attr(data-tooltip);
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0, 0, 0, 0.9);
                        color: #fff;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.75rem;
                        white-space: nowrap;
                        pointer-events: none;
                        opacity: 1;
                        margin-bottom: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        border: 1px solid rgba(139, 92, 246, 0.3);
                        z-index: 1000;
                    }
                    /* Arrow */
                    .editor-btn[data-tooltip]:hover::before {
                        content: '';
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        border-width: 5px;
                        border-style: solid;
                        border-color: rgba(139, 92, 246, 0.3) transparent transparent transparent;
                        margin-bottom: -2px;
                        z-index: 1000;
                    }
                    /* Image Overlay */
                    #imageEditOverlay {
                        position: absolute;
                        display: none;
                        z-index: 9000;
                        background: rgba(0, 0, 0, 0.6);
                        padding: 8px;
                        border-radius: 8px;
                        backdrop-filter: blur(4px);
                        border: 1px solid rgba(139, 92, 246, 0.5);
                        pointer-events: auto;
                        gap: 8px;
                    }
                    #imageEditOverlay button {
                        background: #8B5CF6;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.8rem;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    #imageEditOverlay button:hover {
                        background: #7c3aed;
                    }
                    /* Edit Menu Dropdown */
                    .editor-menu-dropdown {
                        position: relative;
                        display: inline-block;
                    }
                    .editor-menu-content {
                        display: none;
                        position: absolute;
                        bottom: 100%;
                        left: 0;
                        margin-bottom: 8px;
                        background: linear-gradient(135deg, #1a1a24 0%, #12121a 100%);
                        border: 1px solid rgba(139, 92, 246, 0.4);
                        border-radius: 8px;
                        padding: 4px 0;
                        min-width: 220px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                        z-index: 100001;
                        max-height: 400px;
                        overflow-y: auto;
                    }
                    .editor-menu-dropdown:hover .editor-menu-content,
                    .editor-menu-content:hover {
                        display: block;
                    }
                    .menu-item {
                        padding: 10px 20px;
                        color: #fff;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 0.9rem;
                        transition: all 0.2s;
                    }
                    .menu-item:hover {
                        background: rgba(139, 92, 246, 0.2);
                        color: #A78BFA;
                    }
                    .menu-item ion-icon {
                        font-size: 1.1rem;
                        width: 20px;
                    }
                    .menu-divider {
                        height: 1px;
                        background: rgba(255,255,255,0.1);
                        margin: 4px 10px;
                    }
                </style>
                <div class="editor-toolbar">
                    <button class="editor-btn" id="toggleEditor" data-tooltip="Toggle Edit Mode">
                        <ion-icon name="create-outline"></ion-icon>
                        <span>Edit Mode</span>
                    </button>
                    <div class="editor-controls" id="editorControls" style="display: none;">
                        <span class="editor-status">Editing...</span>
                        <div class="separator"></div>
                        
                        <!-- Edit Menu Dropdown -->
                        <div class="editor-menu-dropdown" id="editMenuDropdown">
                            <button class="editor-btn" id="editMenuBtn" data-tooltip="Edit Menu">
                                <span>Edit</span>
                                <ion-icon name="chevron-down-outline" style="font-size: 0.8rem; margin-left: 4px;"></ion-icon>
                            </button>
                            <div class="editor-menu-content" id="editMenuContent">
                                <div class="menu-item" id="menuUndo"><ion-icon name="arrow-undo-outline"></ion-icon> Undo (Ctrl+Z)</div>
                                <div class="menu-item" id="menuRedo"><ion-icon name="arrow-redo-outline"></ion-icon> Redo (Ctrl+Y)</div>
                                <div class="menu-divider"></div>
                                <div class="menu-item" id="menuCut"><ion-icon name="cut-outline"></ion-icon> Cut (Ctrl+X)</div>
                                <div class="menu-item" id="menuCopy"><ion-icon name="copy-outline"></ion-icon> Copy (Ctrl+C)</div>
                                <div class="menu-item" id="menuPaste"><ion-icon name="clipboard-outline"></ion-icon> Paste (Ctrl+V)</div>
                                <div class="menu-divider"></div>
                                <div class="menu-item" id="menuSelectAll"><ion-icon name="checkmark-done-outline"></ion-icon> Select All (Ctrl+A)</div>
                                <div class="menu-divider"></div>
                                <div class="menu-item" id="menuFontFamily"><ion-icon name="text-outline"></ion-icon> Font Family...</div>
                                <div class="menu-item" id="menuFontSize"><ion-icon name="resize-outline"></ion-icon> Font Size...</div>
                                <div class="menu-item" id="menuLineSpacing"><ion-icon name="list-outline"></ion-icon> Line Spacing...</div>
                                <div class="menu-item" id="menuTextColor"><ion-icon name="color-palette-outline"></ion-icon> Text Color...</div>
                                <div class="menu-item" id="menuBgColor"><ion-icon name="color-fill-outline"></ion-icon> Background Color...</div>
                                <div class="menu-divider"></div>
                                <div class="menu-item" id="menuTextAlign"><ion-icon name="text-outline"></ion-icon> Text Alignment...</div>
                                <div class="menu-item" id="menuImageEdit"><ion-icon name="image-outline"></ion-icon> Edit Image...</div>
                            </div>
                        </div>
                        <div class="separator"></div>
                        
                        <!-- Text Formatting -->
                        <button class="editor-btn" id="formatBold" data-tooltip="Bold (Ctrl+B)"><b>B</b></button>
                        <button class="editor-btn" id="formatItalic" data-tooltip="Italic (Ctrl+I)"><i>I</i></button>
                        <button class="editor-btn" id="formatUnderline" data-tooltip="Underline (Ctrl+U)"><u>U</u></button>
                        <button class="editor-btn" id="formatStrike" data-tooltip="Strikethrough"><s>S</s></button>
                        <div class="separator"></div>
                        <!-- Headings -->
                        <button class="editor-btn" id="formatH1" data-tooltip="Heading 1">H1</button>
                        <button class="editor-btn" id="formatH2" data-tooltip="Heading 2">H2</button>
                        <button class="editor-btn" id="formatH3" data-tooltip="Heading 3">H3</button>
                        <div class="separator"></div>
                        <!-- Insert -->
                        <button class="editor-btn" id="insertLink" data-tooltip="Insert Link"><ion-icon name="link-outline"></ion-icon></button>
                        <button class="editor-btn" id="insertImage" data-tooltip="Insert Image"><ion-icon name="image-outline"></ion-icon></button>
                        <div class="separator"></div>
                        <!-- Spoilers -->
                        <button class="editor-btn" id="makeSpoiler" data-tooltip="Make Selection Spoiler"><ion-icon name="eye-off-outline"></ion-icon></button>
                        <button class="editor-btn" id="removeSpoiler" data-tooltip="Remove Spoiler"><ion-icon name="eye-outline"></ion-icon></button>
                        <div class="separator"></div>
                        <!-- Undo/Redo -->
                        <button class="editor-btn" id="undoBtn" data-tooltip="Undo (Ctrl+Z)"><ion-icon name="arrow-undo-outline"></ion-icon></button>
                        <button class="editor-btn" id="redoBtn" data-tooltip="Redo (Ctrl+Y)"><ion-icon name="arrow-redo-outline"></ion-icon></button>
                        <div class="separator"></div>
                        <!-- Actions -->
                        <button class="editor-btn editor-btn-success" id="saveBtn" data-tooltip="Save Changes"><ion-icon name="save-outline"></ion-icon> Save</button>
                        <button class="editor-btn editor-btn-danger" id="cancelBtn" data-tooltip="Cancel Editing"><ion-icon name="close-outline"></ion-icon> Cancel</button>
                        <div class="separator"></div>
                         <button class="editor-btn" id="editSource" data-tooltip="Edit HTML Source"><ion-icon name="code-slash-outline"></ion-icon></button>
                    </div>
                </div>
                <!-- Image Overlay -->
                <div id="imageEditOverlay">
                    <button id="imgOverlayChange"><ion-icon name="image-outline"></ion-icon> Change</button>
                </div>
            </div>
        `;

        if (!document.getElementById('adminEditor')) {
            document.body.insertAdjacentHTML('afterbegin', editorHTML);
        }
    }

    createContextMenuUI() {
        if (document.getElementById('adminContextMenu')) return;

        const menuHTML = `
            <div id="adminContextMenu" class="context-menu">
                <div class="context-header">
                    <ion-icon name="build-outline"></ion-icon>
                    <span>Admin Tools</span>
                </div>
                
                <!-- Edit Mode Toggle -->
                <div class="context-item" id="ctxToggleEdit">
                    <ion-icon name="create-outline"></ion-icon>
                    <span>Toggle Edit Mode</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Page Management Section -->
                <div class="context-section-title">📄 Page</div>
                
                <div class="context-item" id="ctxNewBlankPage">
                    <ion-icon name="add-outline"></ion-icon>
                    <span>New Blank Page</span>
                </div>
                
                <div class="context-item" id="ctxNewCharacterPage">
                    <ion-icon name="person-add-outline"></ion-icon>
                    <span>New Character Page</span>
                </div>
                
                <div class="context-item" id="ctxDuplicatePage">
                    <ion-icon name="copy-outline"></ion-icon>
                    <span>Duplicate This Page</span>
                </div>
                
                <div class="context-item" id="ctxRenamePage">
                    <ion-icon name="pencil-outline"></ion-icon>
                    <span>Rename This Page</span>
                </div>
                
                <div class="context-item context-danger" id="ctxDeletePage">
                    <ion-icon name="trash-outline"></ion-icon>
                    <span>Delete This Page</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Insert Section -->
                <div class="context-section-title">🖼️ Insert</div>
                
                <div class="context-item" id="ctxInsertImage">
                    <ion-icon name="image-outline"></ion-icon>
                    <span>Image</span>
                </div>
                
                <div class="context-item" id="ctxInsertLink">
                    <ion-icon name="link-outline"></ion-icon>
                    <span>Link</span>
                </div>
                
                <div class="context-item" id="ctxInsertTable">
                    <ion-icon name="grid-outline"></ion-icon>
                    <span>Table</span>
                </div>
                
                <div class="context-item" id="ctxInsertList">
                    <ion-icon name="list-outline"></ion-icon>
                    <span>List</span>
                </div>
                
                <div class="context-item" id="ctxInsertDivider">
                    <ion-icon name="remove-outline"></ion-icon>
                    <span>Divider</span>
                </div>
                
                <div class="context-item" id="ctxUploadSlide" style="display: none;">
                    <ion-icon name="images-outline"></ion-icon>
                    <span>Upload Character Slide</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Format Section -->
                <div class="context-section-title">📝 Format</div>
                
                <div class="context-item" id="ctxFormatBold">
                    <ion-icon name="text-outline"></ion-icon>
                    <span><b>Bold</b></span>
                </div>
                
                <div class="context-item" id="ctxFormatItalic">
                    <ion-icon name="text-outline"></ion-icon>
                    <span><i>Italic</i></span>
                </div>
                
                <div class="context-item" id="ctxFormatUnderline">
                    <ion-icon name="text-outline"></ion-icon>
                    <span><u>Underline</u></span>
                </div>
                
                <div class="context-item" id="ctxFormatStrike">
                    <ion-icon name="text-outline"></ion-icon>
                    <span><s>Strikethrough</s></span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Typography Section -->
                <div class="context-section-title">🔤 Typography</div>
                
                <div class="context-item" id="ctxFontFamily">
                    <ion-icon name="text-outline"></ion-icon>
                    <span>Font Family...</span>
                </div>
                
                <div class="context-item" id="ctxFontSize">
                    <ion-icon name="resize-outline"></ion-icon>
                    <span>Font Size...</span>
                </div>
                
                <div class="context-item" id="ctxLineSpacing">
                    <ion-icon name="list-outline"></ion-icon>
                    <span>Line Spacing...</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Colors Section -->
                <div class="context-section-title">🎨 Colors</div>
                
                <div class="context-item" id="ctxTextColor">
                    <ion-icon name="color-palette-outline"></ion-icon>
                    <span>Text Color...</span>
                </div>
                
                <div class="context-item" id="ctxBgColor">
                    <ion-icon name="color-fill-outline"></ion-icon>
                    <span>Background Color...</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Alignment Section -->
                <div class="context-section-title">↔️ Alignment</div>
                
                <div class="context-item" id="ctxAlignLeft">
                    <ion-icon name="arrow-back-outline"></ion-icon>
                    <span>Align Left</span>
                </div>
                
                <div class="context-item" id="ctxAlignCenter">
                    <ion-icon name="remove-outline"></ion-icon>
                    <span>Align Center</span>
                </div>
                
                <div class="context-item" id="ctxAlignRight">
                    <ion-icon name="arrow-forward-outline"></ion-icon>
                    <span>Align Right</span>
                </div>
                
                <div class="context-item" id="ctxAlignJustify">
                    <ion-icon name="resize-outline"></ion-icon>
                    <span>Justify</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Image Editing Section -->
                <div class="context-section-title" id="ctxImageSection" style="display: none;">🖼️ Image</div>
                
                <div class="context-item" id="ctxEditImage" style="display: none;">
                    <ion-icon name="image-outline"></ion-icon>
                    <span>Edit Image...</span>
                </div>
                
                <div class="context-item" id="ctxImageSize" style="display: none;">
                    <ion-icon name="resize-outline"></ion-icon>
                    <span>Resize Image...</span>
                </div>
                
                <div class="context-item" id="ctxImageAlign" style="display: none;">
                    <ion-icon name="move-outline"></ion-icon>
                    <span>Align Image...</span>
                </div>
                
                <div class="context-divider" id="ctxImageDivider" style="display: none;"></div>
                
                <div class="context-divider"></div>
                
                <!-- Other Format -->
                <div class="context-item" id="ctxFormatSpoiler">
                    <ion-icon name="eye-off-outline"></ion-icon>
                    <span>Spoiler</span>
                </div>
                
                <div class="context-divider"></div>
                
                <!-- Actions -->
                <div class="context-item context-success" id="ctxSave">
                    <ion-icon name="save-outline"></ion-icon>
                    <span>Save Changes</span>
                </div>
                
                <div class="context-item" id="ctxDashboard">
                    <ion-icon name="grid-outline"></ion-icon>
                    <span>Dashboard</span>
                </div>
            </div>
            
            <style>
                #adminContextMenu {
                    display: none;
                    position: fixed;
                    z-index: 100000;
                    background: linear-gradient(135deg, #1a1a24 0%, #12121a 100%);
                    border: 1px solid rgba(139, 92, 246, 0.4);
                    border-radius: 12px;
                    padding: 8px 0;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset;
                    min-width: 220px;
                    max-height: 80vh;
                    overflow-y: auto;
                    backdrop-filter: blur(20px);
                }
                .context-header {
                    padding: 10px 15px;
                    color: #8B5CF6;
                    font-weight: 600;
                    font-size: 0.85rem;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    margin-bottom: 5px;
                }
                .context-section-title {
                    padding: 6px 15px;
                    color: #888;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .context-divider {
                    height: 1px;
                    background: rgba(255,255,255,0.1);
                    margin: 5px 10px;
                }
                .context-item {
                    padding: 10px 15px;
                    cursor: pointer;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: all 0.2s;
                    font-size: 0.9rem;
                }
                .context-item:hover {
                    background: rgba(139, 92, 246, 0.2);
                    color: #A78BFA;
                }
                .context-item ion-icon {
                    font-size: 1.1rem;
                }
                .context-danger {
                    color: #f87171 !important;
                }
                .context-danger:hover {
                    background: rgba(248, 113, 113, 0.2) !important;
                    color: #fca5a5 !important;
                }
                .context-success {
                    color: #4ade80 !important;
                }
                .context-success:hover {
                    background: rgba(74, 222, 128, 0.2) !important;
                    color: #86efac !important;
                }
            </style>
        `;
        document.body.insertAdjacentHTML('beforeend', menuHTML);
    }

    createModalUI() {
        const modalHTML = `
            <div id="createPageModal" class="admin-modal">
                <div class="modal-content">
                    <h3>Create New Character Page</h3>
                    
                    <div class="form-field">
                        <label>Character Name</label>
                        <input type="text" id="newPageName" placeholder="e.g. Kim Shi-Hoon">
                    </div>

                    <div class="form-field">
                        <label>Filename ID (Auto-generated)</label>
                        <input type="text" id="newPageId" placeholder="e.g. kim_shi_hoon" readonly>
                    </div>

                    <div class="modal-actions">
                        <button id="cancelCreateBtn" class="btn-secondary">Cancel</button>
                        <button id="confirmCreateBtn" class="btn-primary">Create Page</button>
                    </div>
                </div>
            </div>
            
            <div id="addCharacterModal" class="admin-modal">
                <div class="modal-content">
                    <h3>Add Character to List</h3>
                    <p style="color:#aaa; margin-bottom:1rem; font-size:0.9rem;">This will add a new character card to the Characters page.</p>
                    
                    <div class="form-field">
                        <label>Character Name</label>
                        <input type="text" id="addCharName" placeholder="e.g. Kim Shi-Hoon">
                    </div>

                    <div class="form-field">
                        <label>Page Filename (without .html)</label>
                        <input type="text" id="addCharId" placeholder="e.g. kim_shi_hoon">
                    </div>
                    
                    <div class="form-field">
                        <label>Image Filename</label>
                        <input type="text" id="addCharImage" placeholder="e.g. kim_shi_hoon_profile.png">
                    </div>

                    <div class="modal-actions">
                        <button id="cancelAddCharBtn" class="btn-secondary">Cancel</button>
                        <button id="confirmAddCharBtn" class="btn-primary">Add to List</button>
                    </div>
                </div>
            </div>
            
            <div id="insertLinkModal" class="admin-modal">
                <div class="modal-content">
                    <h3>Insert Link</h3>
                    <div class="form-field">
                        <label>Link Text</label>
                        <input type="text" id="linkText" placeholder="Display text">
                    </div>
                    <div class="form-field">
                        <label>URL</label>
                        <input type="text" id="linkUrl" placeholder="https://...">
                    </div>
                    <div class="modal-actions">
                        <button id="cancelLinkBtn" class="btn-secondary">Cancel</button>
                        <button id="confirmLinkBtn" class="btn-primary">Insert Link</button>
                    </div>
                </div>
            </div>
            
            <div id="insertImageModal" class="admin-modal">
                <div class="modal-content" style="width: 600px;">
                    <h3>Insert Image</h3>
                    <div class="modal-tabs" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                        <button class="tab-btn active" data-tab="img-url">URL</button>
                        <button class="tab-btn" data-tab="img-upload">Upload</button>
                        <button class="tab-btn" data-tab="img-gallery">Gallery</button>
                    </div>

                    <div id="img-url" class="tab-content active">
                        <div class="form-field">
                            <label>Image URL</label>
                            <input type="text" id="imageUrl" placeholder="/assets/images/example.png">
                        </div>
                    </div>

                    <div id="img-upload" class="tab-content" style="display:none;">
                        <div class="drop-zone" id="dropZone" style="border: 2px dashed rgba(139, 92, 246, 0.4); padding: 40px; text-align: center; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                            <ion-icon name="cloud-upload-outline" style="font-size: 3rem; color: #8B5CF6; margin-bottom: 10px;"></ion-icon>
                            <p style="color: #aaa; margin: 0;">Click or Drag & Drop Image Here</p>
                            <input type="file" id="fileInput" accept="image/*" style="display:none;">
                        </div>
                        <div id="uploadPreview" style="margin-top: 15px; display: none; align-items: center; gap: 15px;">
                            <img src="" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">
                            <span style="color: #fff; font-size: 0.9rem;">filename.png</span>
                        </div>
                    </div>

                    <div id="img-gallery" class="tab-content" style="display:none;">
                        <div id="galleryGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; max-height: 200px; overflow-y: auto; padding-right: 5px;">
                            <!-- Gallery items will be injected here -->
                            <p style="color: #aaa; grid-column: 1/-1;">Loading...</p>
                        </div>
                    </div>

                    <div class="form-field" style="margin-top: 15px;">
                        <label>Alt Text</label>
                        <input type="text" id="imageAlt" placeholder="Image description">
                    </div>
                    
                    <div class="modal-actions">
                        <button id="cancelImageBtn" class="btn-secondary">Cancel</button>
                        <button id="confirmImageBtn" class="btn-primary">Insert Image</button>
                    </div>
                </div>
            </div>
            
            <style>
                .admin-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.85);
                    z-index: 10001;
                    align-items: center;
                    justify-content: center;
                }
                .admin-modal.active {
                    display: flex;
                }
                .modal-content {
                    background: linear-gradient(135deg, #1a1a24 0%, #12121a 100%);
                    padding: 2rem;
                    border-radius: 16px;
                    border: 1px solid rgba(139, 92, 246, 0.2);
                    width: 420px;
                    max-width: 90%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                }
                .modal-content h3 {
                    margin: 0 0 1.5rem 0;
                    color: #fff;
                    font-size: 1.3rem;
                }
                .form-field {
                    margin-bottom: 1rem;
                }
                .form-field label {
                    display: block;
                    color: #aaa;
                    margin-bottom: 0.5rem;
                    font-size: 0.85rem;
                }
                .form-field input {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    background: rgba(0,0,0,0.4);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .form-field input:focus {
                    border-color: rgba(139, 92, 246, 0.5);
                }
                .form-field input[readonly] {
                    color: #888;
                }
                .modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                    margin-top: 1.5rem;
                }
                .btn-secondary {
                    padding: 0.6rem 1.2rem;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.2);
                    color: #fff;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-secondary:hover {
                    background: rgba(255,255,255,0.1);
                }
                .btn-primary {
                    padding: 0.6rem 1.5rem;
                    background: linear-gradient(135deg, #8B5CF6, #6D28D9);
                    border: none;
                    color: #fff;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
                }
            </style>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add formatting modals
        this.createFormattingModals();
    }

    createFormattingModals() {
        const formattingModalsHTML = `
            <!-- Font Family Modal -->
            <div id="fontFamilyModal" class="admin-modal">
                <div class="modal-content" style="width: 400px;">
                    <h3><ion-icon name="text-outline"></ion-icon> Font Family</h3>
                    <div class="form-field">
                        <label>Select Font Family</label>
                        <select id="fontFamilySelect" style="width: 100%; padding: 0.75rem 1rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 0.95rem;">
                            <option value="">Default</option>
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="'Times New Roman', serif">Times New Roman</option>
                            <option value="'Courier New', monospace">Courier New</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="Verdana, sans-serif">Verdana</option>
                            <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                            <option value="Impact, sans-serif">Impact</option>
                            <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                            <option value="'Lucida Console', monospace">Lucida Console</option>
                            <option value="Tahoma, sans-serif">Tahoma</option>
                            <option value="'Palatino Linotype', serif">Palatino</option>
                            <option value="'Garamond', serif">Garamond</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button id="cancelFontFamilyBtn" class="btn-secondary">Cancel</button>
                        <button id="applyFontFamilyBtn" class="btn-primary">Apply</button>
                    </div>
                </div>
            </div>
            
            <!-- Font Size Modal -->
            <div id="fontSizeModal" class="admin-modal">
                <div class="modal-content" style="width: 400px;">
                    <h3><ion-icon name="resize-outline"></ion-icon> Font Size</h3>
                    <div class="form-field">
                        <label>Font Size (px, em, rem, or %)</label>
                        <input type="text" id="fontSizeInput" placeholder="e.g. 16px, 1.2em, 120%">
                    </div>
                    <div style="margin: 1rem 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        <button class="quick-size-btn" data-size="12px">12px</button>
                        <button class="quick-size-btn" data-size="14px">14px</button>
                        <button class="quick-size-btn" data-size="16px">16px</button>
                        <button class="quick-size-btn" data-size="18px">18px</button>
                        <button class="quick-size-btn" data-size="20px">20px</button>
                        <button class="quick-size-btn" data-size="24px">24px</button>
                        <button class="quick-size-btn" data-size="32px">32px</button>
                        <button class="quick-size-btn" data-size="48px">48px</button>
                    </div>
                    <div class="modal-actions">
                        <button id="cancelFontSizeBtn" class="btn-secondary">Cancel</button>
                        <button id="applyFontSizeBtn" class="btn-primary">Apply</button>
                    </div>
                </div>
            </div>
            
            <!-- Line Spacing Modal -->
            <div id="lineSpacingModal" class="admin-modal">
                <div class="modal-content" style="width: 400px;">
                    <h3><ion-icon name="list-outline"></ion-icon> Line Spacing</h3>
                    <div class="form-field">
                        <label>Line Height (number, px, em, or %)</label>
                        <input type="text" id="lineSpacingInput" placeholder="e.g. 1.5, 24px, 150%">
                    </div>
                    <div style="margin: 1rem 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        <button class="quick-spacing-btn" data-spacing="1">Single</button>
                        <button class="quick-spacing-btn" data-spacing="1.15">1.15</button>
                        <button class="quick-spacing-btn" data-spacing="1.5">1.5</button>
                        <button class="quick-spacing-btn" data-spacing="2">Double</button>
                    </div>
                    <div class="modal-actions">
                        <button id="cancelLineSpacingBtn" class="btn-secondary">Cancel</button>
                        <button id="applyLineSpacingBtn" class="btn-primary">Apply</button>
                    </div>
                </div>
            </div>
            
            <!-- Text Color Modal -->
            <div id="textColorModal" class="admin-modal">
                <div class="modal-content" style="width: 450px;">
                    <h3><ion-icon name="color-palette-outline"></ion-icon> Text Color</h3>
                    <div class="form-field">
                        <label>Color (hex, rgb, or name)</label>
                        <input type="text" id="textColorInput" placeholder="#ffffff, rgb(255,255,255), or white">
                    </div>
                    <div style="margin: 1rem 0;">
                        <label style="display: block; margin-bottom: 0.5rem; color: #aaa;">Quick Colors:</label>
                        <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px;">
                            <div class="color-swatch" data-color="#000000" style="background: #000; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#333333" style="background: #333; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#666666" style="background: #666; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#999999" style="background: #999; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#ffffff" style="background: #fff; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#8B5CF6" style="background: #8B5CF6; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#EF4444" style="background: #EF4444; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#10B981" style="background: #10B981; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#3B82F6" style="background: #3B82F6; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#F59E0B" style="background: #F59E0B; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#EC4899" style="background: #EC4899; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="color-swatch" data-color="#6366F1" style="background: #6366F1; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button id="cancelTextColorBtn" class="btn-secondary">Cancel</button>
                        <button id="applyTextColorBtn" class="btn-primary">Apply</button>
                    </div>
                </div>
            </div>
            
            <!-- Background Color Modal -->
            <div id="bgColorModal" class="admin-modal">
                <div class="modal-content" style="width: 450px;">
                    <h3><ion-icon name="color-fill-outline"></ion-icon> Background Color</h3>
                    <div class="form-field">
                        <label>Color (hex, rgb, or name)</label>
                        <input type="text" id="bgColorInput" placeholder="#000000, rgb(0,0,0), or black">
                    </div>
                    <div style="margin: 1rem 0;">
                        <label style="display: block; margin-bottom: 0.5rem; color: #aaa;">Quick Colors:</label>
                        <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px;">
                            <div class="bg-color-swatch" data-color="#000000" style="background: #000; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#1a1a24" style="background: #1a1a24; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#333333" style="background: #333; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#ffffff" style="background: #fff; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#8B5CF6" style="background: #8B5CF6; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#EF4444" style="background: #EF4444; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#10B981" style="background: #10B981; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#3B82F6" style="background: #3B82F6; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#F59E0B" style="background: #F59E0B; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#EC4899" style="background: #EC4899; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="#6366F1" style="background: #6366F1; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                            <div class="bg-color-swatch" data-color="transparent" style="background: linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%); background-size: 10px 10px; background-position: 0 0, 0 5px, 5px -5px, -5px 0px; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(255,255,255,0.2);"></div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button id="cancelBgColorBtn" class="btn-secondary">Cancel</button>
                        <button id="applyBgColorBtn" class="btn-primary">Apply</button>
                    </div>
                </div>
            </div>
            
            <!-- Image Edit Enhanced Modal -->
            <div id="enhancedImageEditModal" class="admin-modal">
                <div class="modal-content" style="max-width: 700px;">
                    <h3><ion-icon name="image-outline"></ion-icon> Edit Image</h3>
                    
                    <div id="enhancedImagePreview" style="text-align: center; margin: 15px 0;">
                        <img id="enhancedImgPreview" src="" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 2px solid rgba(139,92,246,0.3);">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-field">
                            <label>Image URL / Path</label>
                            <input type="text" id="enhancedImgSrc" style="font-family: monospace;">
                        </div>
                        
                        <div class="form-field">
                            <label>Alt Text</label>
                            <input type="text" id="enhancedImgAlt" placeholder="Image description">
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                        <div class="form-field">
                            <label>Width</label>
                            <input type="text" id="enhancedImgWidth" placeholder="e.g. 200px, 50%">
                        </div>
                        
                        <div class="form-field">
                            <label>Height</label>
                            <input type="text" id="enhancedImgHeight" placeholder="e.g. 300px, auto">
                        </div>
                        
                        <div class="form-field">
                            <label>Alignment</label>
                            <select id="enhancedImgAlign" style="width: 100%; padding: 0.75rem 1rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff;">
                                <option value="">Default</option>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-field" style="margin-top: 1rem;">
                        <label>Border Radius (optional)</label>
                        <input type="text" id="enhancedImgBorderRadius" placeholder="e.g. 8px, 50%">
                    </div>
                    
                    <div class="modal-actions">
                        <button id="browseEnhancedImgBtn" class="btn-secondary"><ion-icon name="folder-outline"></ion-icon> Browse Assets</button>
                        <button id="cancelEnhancedImgBtn" class="btn-secondary">Cancel</button>
                        <button id="applyEnhancedImgBtn" class="btn-primary">Apply Changes</button>
                    </div>
                </div>
            </div>
            
            <style>
                .quick-size-btn, .quick-spacing-btn {
                    padding: 0.5rem;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    color: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .quick-size-btn:hover, .quick-spacing-btn:hover {
                    background: rgba(139, 92, 246, 0.3);
                    border-color: rgba(139, 92, 246, 0.5);
                }
                .color-swatch:hover, .bg-color-swatch:hover {
                    transform: scale(1.1);
                    border-color: #8B5CF6 !important;
                }
            </style>
        `;
        document.body.insertAdjacentHTML('beforeend', formattingModalsHTML);
    }

    attachEventListeners() {
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            const menuItem = e.target.closest('.menu-item');
            const ctxItem = e.target.closest('.context-item');
            const swatch = e.target.closest('.color-swatch, .bg-color-swatch');

            if (btn || menuItem) {
                const target = btn || menuItem;
                if (target.id === 'toggleEditor') this.toggleEditMode();
                if (target.id === 'makeSpoiler') this.wrapSelectionInSpoiler();
                if (target.id === 'removeSpoiler') this.removeSpoiler();
                if (target.id === 'saveBtn') this.saveChanges();
                if (target.id === 'cancelBtn') this.cancelEdit();
                if (target.id === 'editSource') this.editSource();
                if (target.id === 'formatBold') this.formatText('bold');
                if (target.id === 'formatItalic') this.formatText('italic');
                if (target.id === 'formatUnderline') this.formatText('underline');
                if (target.id === 'formatStrike') this.formatText('strikeThrough');
                if (target.id === 'formatH1') this.formatBlock('h1');
                if (target.id === 'formatH2') this.formatBlock('h2');
                if (target.id === 'formatH3') this.formatBlock('h3');
                if (target.id === 'insertLink') this.openModal('insertLinkModal');
                if (target.id === 'insertImage') this.openModal('insertImageModal');
                if (target.id === 'undoBtn') document.execCommand('undo');
                if (target.id === 'redoBtn') document.execCommand('redo');

                // Edit Menu Items
                if (target.id === 'menuUndo') document.execCommand('undo');
                if (target.id === 'menuRedo') document.execCommand('redo');
                if (target.id === 'menuCut') document.execCommand('cut');
                if (target.id === 'menuCopy') document.execCommand('copy');
                if (target.id === 'menuPaste') document.execCommand('paste');
                if (target.id === 'menuSelectAll') document.execCommand('selectAll');
                if (target.id === 'menuFontFamily') this.openModal('fontFamilyModal');
                if (target.id === 'menuFontSize') this.openModal('fontSizeModal');
                if (target.id === 'menuLineSpacing') this.openModal('lineSpacingModal');
                if (target.id === 'menuTextColor') this.openModal('textColorModal');
                if (target.id === 'menuBgColor') this.openModal('bgColorModal');
                if (target.id === 'menuTextAlign') this.openTextAlignModal();
                if (target.id === 'menuImageEdit') {
                    const img = this.getSelectedImage();
                    if (img) this.showEnhancedImageEdit(img);
                    else this.showNotification('Select an image first', 'warning');
                }

                // Formatting Modal Buttons
                if (target.id === 'cancelFontFamilyBtn') this.closeModal('fontFamilyModal');
                if (target.id === 'applyFontFamilyBtn') this.applyFontFamily();
                if (target.id === 'cancelFontSizeBtn') this.closeModal('fontSizeModal');
                if (target.id === 'applyFontSizeBtn') this.applyFontSize();
                if (target.id === 'cancelLineSpacingBtn') this.closeModal('lineSpacingModal');
                if (target.id === 'applyLineSpacingBtn') this.applyLineSpacing();
                if (target.id === 'cancelTextColorBtn') this.closeModal('textColorModal');
                if (target.id === 'applyTextColorBtn') this.applyTextColor();
                if (target.id === 'cancelBgColorBtn') this.closeModal('bgColorModal');
                if (target.id === 'applyBgColorBtn') this.applyBgColor();
                if (target.id === 'cancelEnhancedImgBtn') this.closeModal('enhancedImageEditModal');
                if (target.id === 'applyEnhancedImgBtn') this.applyEnhancedImageEdit();

                // Quick buttons
                if (target.classList.contains('quick-size-btn')) {
                    document.getElementById('fontSizeInput').value = target.dataset.size;
                }
                if (target.classList.contains('quick-spacing-btn')) {
                    document.getElementById('lineSpacingInput').value = target.dataset.spacing;
                }

                // Link Modal
                if (target.id === 'cancelLinkBtn') this.closeModal('insertLinkModal');
                if (target.id === 'confirmLinkBtn') this.insertLink();
                // Image Modal
                if (target.id === 'cancelImageBtn') this.closeModal('insertImageModal');
                if (target.id === 'confirmImageBtn') this.insertImage();

                // Enhanced Image Edit
                if (target.id === 'browseEnhancedImgBtn') {
                    this.browseAssetsForEnhancedImage();
                }

                // Image Modal Tabs
                if (target.classList.contains('tab-btn')) {
                    const tabId = target.dataset.tab;
                    const modal = target.closest('.modal-content');

                    // Switch tabs
                    modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    target.classList.add('active');

                    modal.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                    document.getElementById(tabId).style.display = 'block';

                    if (tabId === 'img-gallery') this.loadGallery();
                }

                // Create Page Modal
                if (target.id === 'cancelCreateBtn') this.closeModal('createPageModal');
                if (target.id === 'confirmCreateBtn') this.createNewPage();

                // Add Character Modal
                if (target.id === 'cancelAddCharBtn') this.closeModal('addCharacterModal');
                if (target.id === 'confirmAddCharBtn') this.addCharacterToList();
            }

            if (swatch) {
                if (swatch.classList.contains('color-swatch')) {
                    document.getElementById('textColorInput').value = swatch.dataset.color;
                }
                if (swatch.classList.contains('bg-color-swatch')) {
                    document.getElementById('bgColorInput').value = swatch.dataset.color;
                }
            }

            if (ctxItem) {
                this.hideContextMenu();

                // Edit Mode
                if (ctxItem.id === 'ctxToggleEdit') this.toggleEditMode();

                // Page Management
                if (ctxItem.id === 'ctxNewBlankPage') this.createBlankPage();
                if (ctxItem.id === 'ctxNewCharacterPage') this.createCharacterPage();
                if (ctxItem.id === 'ctxDuplicatePage') this.duplicatePage();
                if (ctxItem.id === 'ctxRenamePage') this.renamePage();
                if (ctxItem.id === 'ctxDeletePage') this.deletePage();

                // Insert
                if (ctxItem.id === 'ctxInsertImage') this.openModal('insertImageModal');
                if (ctxItem.id === 'ctxInsertLink') this.openModal('insertLinkModal');
                if (ctxItem.id === 'ctxInsertTable') this.insertTable();
                if (ctxItem.id === 'ctxInsertList') this.insertList();
                if (ctxItem.id === 'ctxInsertDivider') document.execCommand('insertHorizontalRule');
                if (ctxItem.id === 'ctxUploadSlide') this.triggerSlideUpload();

                // Format
                if (ctxItem.id === 'ctxFormatBold') this.formatText('bold');
                if (ctxItem.id === 'ctxFormatItalic') this.formatText('italic');
                if (ctxItem.id === 'ctxFormatUnderline') this.formatText('underline');
                if (ctxItem.id === 'ctxFormatStrike') this.formatText('strikeThrough');
                if (ctxItem.id === 'ctxFormatSpoiler') this.wrapSelectionInSpoiler();

                // Typography
                if (ctxItem.id === 'ctxFontFamily') this.openModal('fontFamilyModal');
                if (ctxItem.id === 'ctxFontSize') this.openModal('fontSizeModal');
                if (ctxItem.id === 'ctxLineSpacing') this.openModal('lineSpacingModal');

                // Colors
                if (ctxItem.id === 'ctxTextColor') this.openModal('textColorModal');
                if (ctxItem.id === 'ctxBgColor') this.openModal('bgColorModal');

                // Alignment
                if (ctxItem.id === 'ctxAlignLeft') this.applyAlignment('left');
                if (ctxItem.id === 'ctxAlignCenter') this.applyAlignment('center');
                if (ctxItem.id === 'ctxAlignRight') this.applyAlignment('right');
                if (ctxItem.id === 'ctxAlignJustify') this.applyAlignment('justify');

                // Image Editing
                if (ctxItem.id === 'ctxEditImage') {
                    const img = this.getContextTargetImage();
                    if (img) this.showEnhancedImageEdit(img);
                }
                if (ctxItem.id === 'ctxImageSize') {
                    const img = this.getContextTargetImage();
                    if (img) {
                        this.openModal('enhancedImageEditModal');
                        this.populateImageEditModal(img);
                    }
                }
                if (ctxItem.id === 'ctxImageAlign') {
                    const img = this.getContextTargetImage();
                    if (img) {
                        this.openModal('enhancedImageEditModal');
                        this.populateImageEditModal(img);
                    }
                }

                // Actions
                if (ctxItem.id === 'ctxSave') this.saveChanges();
                if (ctxItem.id === 'ctxDashboard') window.location.href = '/pages/admin/dashboard.html';

                // Legacy handlers
                if (ctxItem.id === 'ctxCreatePage') this.openModal('createPageModal');
                if (ctxItem.id === 'ctxAddCharacter') this.openModal('addCharacterModal');
            }
        });

        // Image Upload Listeners
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#8B5CF6';
                dropZone.style.background = 'rgba(139, 92, 246, 0.1)';
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                dropZone.style.background = 'transparent';
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                dropZone.style.background = 'transparent';

                if (e.dataTransfer.files.length) {
                    this.handleFileUpload(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFileUpload(e.target.files[0]);
                }
            });
        }

        // Auto-fill ID fields
        const nameInput = document.getElementById('newPageName');
        const idInput = document.getElementById('newPageId');
        if (nameInput && idInput) {
            nameInput.addEventListener('input', (e) => {
                idInput.value = this.slugify(e.target.value);
            });
        }

        const addNameInput = document.getElementById('addCharName');
        const addIdInput = document.getElementById('addCharId');
        const addImageInput = document.getElementById('addCharImage');
        if (addNameInput && addIdInput && addImageInput) {
            addNameInput.addEventListener('input', (e) => {
                const slug = this.slugify(e.target.value);
                addIdInput.value = slug;
                addImageInput.value = slug + '_profile.png';
            });
        }
    }

    // Image Hover Editor Logic
    initImageHoverEditor() {
        const imgOverlay = document.getElementById('imageEditOverlay');
        const imgChangeBtn = document.getElementById('imgOverlayChange');
        let currentImg = null;

        if (imgOverlay && imgChangeBtn) {
            document.addEventListener('mouseover', (e) => {
                if (!this.isEditorActive) return;

                // If hovering an image content
                if (e.target.tagName === 'IMG' && !e.target.closest('#adminEditor') && !e.target.closest('.modal-content')) {
                    currentImg = e.target;
                    const rect = currentImg.getBoundingClientRect();
                    imgOverlay.style.display = 'flex';
                    // Position at top-left of image
                    imgOverlay.style.top = (window.scrollY + rect.top + 10) + 'px';
                    imgOverlay.style.left = (window.scrollX + rect.left + 10) + 'px';
                }
                // If hovering the overlay itself, keep it
                else if (e.target.closest('#imageEditOverlay')) {
                    // keep visible
                }
                // If hovering something else, hide it
                else {
                    imgOverlay.style.display = 'none';
                }
            });

            imgChangeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent document click handling
                if (currentImg) {
                    const newUrl = prompt("Enter new image URL:", currentImg.src);
                    if (newUrl) {
                        currentImg.src = newUrl;
                        this.showNotification('Image updated', 'success');
                        imgOverlay.style.display = 'none';
                    }
                }
            });
        }
    }

    slugify(text) {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    initContextMenu() {
        this.contextTargetCarousel = null;
        this.contextMenuTarget = null;
        document.addEventListener('contextmenu', (e) => {
            if (!this.isAdmin) return;
            if (e.shiftKey) return; // Shift+RightClick = browser menu

            e.preventDefault();

            // Store the target element
            this.contextMenuTarget = e.target;

            // Check if right-clicked on a carousel image
            const carouselContainer = e.target.closest('.carousel-container');
            const uploadSlideItem = document.getElementById('ctxUploadSlide');
            if (carouselContainer) {
                this.contextTargetCarousel = carouselContainer;
                if (uploadSlideItem) uploadSlideItem.style.display = 'flex';
            } else {
                this.contextTargetCarousel = null;
                if (uploadSlideItem) uploadSlideItem.style.display = 'none';
            }

            // Check if right-clicked on an image
            const img = e.target.closest('img');
            const imageSection = document.getElementById('ctxImageSection');
            const editImageItem = document.getElementById('ctxEditImage');
            const imageSizeItem = document.getElementById('ctxImageSize');
            const imageAlignItem = document.getElementById('ctxImageAlign');
            const imageDivider = document.getElementById('ctxImageDivider');

            if (img && !img.closest('#adminEditor') && !img.closest('.admin-modal')) {
                if (imageSection) imageSection.style.display = 'block';
                if (editImageItem) editImageItem.style.display = 'flex';
                if (imageSizeItem) imageSizeItem.style.display = 'flex';
                if (imageAlignItem) imageAlignItem.style.display = 'flex';
                if (imageDivider) imageDivider.style.display = 'block';
                this.contextMenuTarget = img;
            } else {
                if (imageSection) imageSection.style.display = 'none';
                if (editImageItem) editImageItem.style.display = 'none';
                if (imageSizeItem) imageSizeItem.style.display = 'none';
                if (imageAlignItem) imageAlignItem.style.display = 'none';
                if (imageDivider) imageDivider.style.display = 'none';
            }

            this.showContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('scroll', () => this.hideContextMenu());
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('adminContextMenu');
        if (menu) {
            menu.style.display = 'block';
            // Adjust position to stay within viewport
            const rect = menu.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width - 10;
            const maxY = window.innerHeight - rect.height - 10;
            menu.style.left = `${Math.min(x, maxX)}px`;
            menu.style.top = `${Math.min(y, maxY)}px`;
        }
    }

    hideContextMenu() {
        const menu = document.getElementById('adminContextMenu');
        if (menu) menu.style.display = 'none';
    }

    openModal(id) {
        if (this.isEditorActive) this.saveSelection();
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            const firstInput = modal.querySelector('input');
            if (firstInput) firstInput.focus();
        }
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            modal.querySelectorAll('input').forEach(inp => inp.value = '');
        }
    }

    async createNewPage() {
        const name = document.getElementById('newPageName').value;
        const id = document.getElementById('newPageId').value;

        if (!name || !id) {
            this.showNotification('Please enter a name', 'warning');
            return;
        }

        this.showNotification('Creating Page...', 'info');

        try {
            const templatePath = '/pages/templates/character_template.html';
            const tplRes = await fetch(templatePath);
            if (!tplRes.ok) throw new Error('Failed to load template');

            let html = await tplRes.text();
            html = html.replace(/{{CHARACTER_NAME}}/g, name);
            html = html.replace(/{{CHARACTER_ID}}/g, id);

            const newPath = `pages/characters/${id}.html`;

            const saveRes = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: newPath, content: html })
            });

            if (saveRes.ok) {
                this.showNotification('Page Created!', 'success');
                this.closeModal('createPageModal');
                setTimeout(() => {
                    window.location.href = `/${newPath}`;
                }, 800);
            } else {
                throw new Error('Server failed to save');
            }

        } catch (e) {
            console.error(e);
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    async addCharacterToList() {
        const name = document.getElementById('addCharName').value;
        const id = document.getElementById('addCharId').value;
        const image = document.getElementById('addCharImage').value;

        if (!name || !id || !image) {
            this.showNotification('Please fill all fields', 'warning');
            return;
        }

        this.showNotification('Adding Character...', 'info');

        try {
            // 1. Fetch current characters.html
            const res = await fetch('/pages/characters.html');
            if (!res.ok) throw new Error('Failed to load characters.html');
            let html = await res.text();

            // 2. Find the character grid and add new card
            // We'll insert before the closing </div> of the character-grid
            const newCard = `
                <a href="characters/${id}.html" class="character-card">
                    <img src="../assets/images/${image}" alt="${name}"
                        style="width:100%; height:100%; object-fit:cover; border-radius:12px;">
                    <div class="character-name">${name}</div>
                </a>
            `;

            // Find the last character card in the grid and insert after it
            // Simple approach: find '</div>\n        </div>' which closes the grid
            // More robust: find .character-grid closing
            const gridEndPattern = /(<\/div>\s*<\/div>\s*<\/section>)/;
            const match = html.match(gridEndPattern);

            if (match) {
                // Insert before the closing tags
                html = html.replace(gridEndPattern, `${newCard}\n            </div>\n        </div>\n    </section>`);
            } else {
                // Fallback: just append to end of last character-grid
                // Find last </a> before </div> in character-grid section
                const lastCardPattern = /(<\/a>\s*)(<\/div>\s*<\/div>\s*<\/section>)/;
                html = html.replace(lastCardPattern, `$1${newCard}\n            $2`);
            }

            // 3. Save the modified file
            const saveRes = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: 'pages/characters.html', content: html })
            });

            if (saveRes.ok) {
                this.showNotification('Character Added! Reloading...', 'success');
                this.closeModal('addCharacterModal');
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error('Failed to save');
            }

        } catch (e) {
            console.error(e);
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    // === NEW PAGE MANAGEMENT METHODS ===

    async deletePage() {
        const currentPath = window.location.pathname;

        // Prevent deleting critical pages
        const protectedPages = ['/', '/index.html', '/pages/characters.html'];
        if (protectedPages.some(p => currentPath === p || currentPath.endsWith(p))) {
            this.showNotification('Cannot delete protected pages!', 'error');
            return;
        }

        // Show confirmation modal
        const confirmation = prompt('⚠️ DELETE PAGE ⚠️\n\nThis action cannot be undone!\n\nType "DELETE" to confirm:');
        if (confirmation !== 'DELETE') {
            this.showNotification('Deletion cancelled', 'info');
            return;
        }

        this.showNotification('Deleting page...', 'info');

        try {
            const response = await window.rtocFetch('/api/pages/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentPath })
            });

            if (response.ok) {
                this.showNotification('Page deleted!', 'success');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                throw new Error('Server failed to delete page');
            }
        } catch (e) {
            console.error(e);
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    async createBlankPage() {
        const name = prompt('Enter page name:');
        if (!name) return;

        const id = this.slugify(name);
        const path = prompt('Enter folder path (e.g., pages/concepts/):', 'pages/');
        if (!path) return;

        const fullPath = `${path}${id}.html`;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} | RToC Wiki</title>
    <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
    <main class="content-section">
        <h1>${name}</h1>
        <p>Content goes here...</p>
    </main>
    
    <script src="/scripts/main.js"></script>
    <script src="/scripts/editor.js"></script>
    <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
</body>
</html>`;

        try {
            const res = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: fullPath, content: html })
            });

            if (res.ok) {
                this.showNotification('Page created!', 'success');
                setTimeout(() => window.location.href = '/' + fullPath, 800);
            } else {
                throw new Error('Failed to create page');
            }
        } catch (e) {
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    async createCharacterPage() {
        const name = prompt('Enter character name:');
        if (!name) return;

        const id = this.slugify(name);

        this.showNotification('Creating character page...', 'info');

        try {
            // Load the character template
            const templateRes = await fetch('/templates/character_template.html');
            if (!templateRes.ok) throw new Error('Template not found');

            let html = await templateRes.text();
            html = html.replace(/{{CHARACTER_NAME}}/g, name);
            html = html.replace(/{{CHARACTER_ID}}/g, id);

            const path = `pages/characters/${id}.html`;

            const saveRes = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: path, content: html })
            });

            if (saveRes.ok) {
                this.showNotification('Character page created!', 'success');
                setTimeout(() => window.location.href = '/' + path, 800);
            } else {
                throw new Error('Failed to save');
            }
        } catch (e) {
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    async duplicatePage() {
        const newName = prompt('Enter name for the duplicate:');
        if (!newName) return;

        const newId = this.slugify(newName);
        const currentPath = window.location.pathname;
        const pathParts = currentPath.split('/');
        pathParts.pop(); // Remove current filename
        const newPath = pathParts.join('/') + '/' + newId + '.html';

        try {
            // Get current page content
            const html = document.documentElement.outerHTML;

            const res = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: newPath.replace(/^\//, ''), content: html })
            });

            if (res.ok) {
                this.showNotification('Page duplicated!', 'success');
                setTimeout(() => window.location.href = newPath, 800);
            } else {
                throw new Error('Failed to duplicate');
            }
        } catch (e) {
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    async renamePage() {
        const newName = prompt('Enter new page name:');
        if (!newName) return;

        const newId = this.slugify(newName);
        const currentPath = window.location.pathname;
        const pathParts = currentPath.split('/');
        pathParts.pop();
        const newPath = pathParts.join('/') + '/' + newId + '.html';

        const confirm = window.confirm(`Rename to: ${newPath}\n\nThis will create a new page and delete the old one.`);
        if (!confirm) return;

        try {
            const html = document.documentElement.outerHTML;

            // Save to new location
            const saveRes = await window.rtocFetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: newPath.replace(/^\//, ''), content: html })
            });

            if (!saveRes.ok) throw new Error('Failed to save new page');

            // Delete old page
            await window.rtocFetch('/api/pages/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentPath })
            });

            this.showNotification('Page renamed!', 'success');
            setTimeout(() => window.location.href = newPath, 800);
        } catch (e) {
            this.showNotification('Error: ' + e.message, 'error');
        }
    }

    insertTable() {
        const rows = parseInt(prompt('Number of rows:', '3'));
        const cols = parseInt(prompt('Number of columns:', '3'));

        if (!rows || !cols) return;

        let html = '<table style="width: 100%; border-collapse: collapse; margin: 1rem 0;">';
        html += '<thead><tr>';
        for (let c = 0; c < cols; c++) {
            html += '<th style="border: 1px solid rgba(255,255,255,0.2); padding: 8px; background: rgba(139,92,246,0.2);">Header</th>';
        }
        html += '</tr></thead><tbody>';

        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                html += '<td style="border: 1px solid rgba(255,255,255,0.2); padding: 8px;">Cell</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        document.execCommand('insertHTML', false, html);
        this.showNotification('Table inserted!', 'success');
    }

    insertList() {
        const type = prompt('List type? (1 = numbered, 2 = bulleted)', '2');
        const items = parseInt(prompt('Number of items:', '3'));

        if (!items) return;

        const tag = type === '1' ? 'ol' : 'ul';
        let html = `<${tag} style="margin: 1rem 0; padding-left: 2rem;">`;
        for (let i = 0; i < items; i++) {
            html += '<li>List item</li>';
        }
        html += `</${tag}>`;

        document.execCommand('insertHTML', false, html);
        this.showNotification('List inserted!', 'success');
    }

    // === Existing Editor Methods ===

    removeSpoiler() {
        if (!this.isEditorActive) return;
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        let node = selection.anchorNode;
        while (node && node !== document.body) {
            if (node.nodeType === 1 && node.classList.contains('spoiler')) {
                const parent = node.parentNode;
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                parent.removeChild(node);
                this.showNotification('Spoiler Removed', 'success');
                return;
            }
            node = node.parentNode;
        }
        this.showNotification('Not inside a spoiler', 'warning');
    }

    toggleEditMode() {
        this.isEditorActive = !this.isEditorActive;
        const controls = document.getElementById('editorControls');
        const toggleBtn = document.getElementById('toggleEditor');

        // store initial state of body for cancel
        if (!this.originalBodyHTML) {
            this.originalBodyHTML = document.body.innerHTML;
        }

        if (this.isEditorActive) {
            document.body.classList.add('is-editing');
            controls.style.display = 'flex';
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<ion-icon name="close-circle-outline"></ion-icon><span>Exit</span>';
            this.setEditableState(true);
            this.showNotification('Edit Mode ON', 'success');

            // Add style for editable zones if not exists
            if (!document.getElementById('editorStyles')) {
                const style = document.createElement('style');
                style.id = 'editorStyles';
                style.textContent = `
                    .editable-zone {
                        outline: 1px dashed rgba(139, 92, 246, 0.3);
                        transition: all 0.2s;
                    }
                    .editable-zone:hover, .editable-zone:focus {
                        outline: 2px solid #8B5CF6;
                        background: rgba(139, 92, 246, 0.05);
                        cursor: text;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            document.body.classList.remove('is-editing');
            controls.style.display = 'none';
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon><span>Edit Mode</span>';
            this.setEditableState(false);
            this.showNotification('Edit Mode OFF', 'info');
        }
    }

    setEditableState(isEditable) {
        // Universal editable zones
        const editableSelectors = [
            '.character-main', '.character-sidebar .infobox-section',
            '.character-sidebar .infobox-title', '.hero-title',
            '.hero-subtitle', '.section-content', '.section-title',
            '.character-section-title', 'main p', 'main h1', 'main h2', 'main h3',
            '.content-section', 'section p', 'section h2', 'section h3',
            '.category-item h3', '.category-item p'
        ];
        editableSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                el.contentEditable = isEditable;
                if (isEditable) {
                    el.classList.add('editable-zone');
                } else {
                    el.classList.remove('editable-zone');
                }
            });
        });

        // IMAGE EDITING: Make all images clickable for path editing
        if (isEditable) {
            this.initImageEditing();
        } else {
            this.cleanupImageEditing();
        }
    }

    initImageEditing() {
        // Add edit overlay to all images
        document.querySelectorAll('img:not(.user-avatar-sm):not([data-no-edit])').forEach(img => {
            if (img.closest('#adminEditor') || img.closest('.admin-modal')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'img-edit-wrapper';
            wrapper.style.cssText = 'position: relative; display: inline-block;';

            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);

            const overlay = document.createElement('div');
            overlay.className = 'img-edit-overlay';
            overlay.innerHTML = `
                <button class="img-edit-btn" title="Change Image">
                    <ion-icon name="image-outline"></ion-icon>
                    <span>Edit Image</span>
                </button>
            `;
            overlay.style.cssText = `
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(139, 92, 246, 0.7);
                display: none; align-items: center; justify-content: center;
                cursor: pointer; border-radius: inherit;
            `;
            wrapper.appendChild(overlay);

            // Show overlay on hover
            wrapper.addEventListener('mouseenter', () => {
                if (this.isEditorActive) overlay.style.display = 'flex';
            });
            wrapper.addEventListener('mouseleave', () => {
                overlay.style.display = 'none';
            });

            // Handle click
            overlay.querySelector('.img-edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showImageEditModal(img);
            });
        });

        // Add the edit button styles
        if (!document.getElementById('imgEditStyles')) {
            const style = document.createElement('style');
            style.id = 'imgEditStyles';
            style.textContent = `
                .img-edit-btn {
                    background: rgba(0,0,0,0.8);
                    border: 2px solid #8B5CF6;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }
                .img-edit-btn:hover {
                    background: #8B5CF6;
                    transform: scale(1.05);
                }
                .img-edit-btn ion-icon {
                    font-size: 1.2rem;
                }
            `;
            document.head.appendChild(style);
        }
    }

    cleanupImageEditing() {
        document.querySelectorAll('.img-edit-wrapper').forEach(wrapper => {
            const img = wrapper.querySelector('img');
            if (img && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(img, wrapper);
                wrapper.remove();
            }
        });
    }

    showImageEditModal(img) {
        // Create modal for image editing
        const modal = document.createElement('div');
        modal.className = 'admin-modal active';
        modal.id = 'imageEditModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <h3><ion-icon name="image-outline"></ion-icon> Edit Image</h3>
                
                <div style="text-align: center; margin: 15px 0;">
                    <img src="${img.src}" style="max-width: 100%; max-height: 200px; border-radius: 8px; border: 2px solid rgba(139,92,246,0.3);">
                </div>
                
                <div class="form-field">
                    <label>Image URL / Path</label>
                    <input type="text" id="editImgSrc" value="${img.src}" style="font-family: monospace;">
                </div>
                
                <div class="form-field">
                    <label>Alt Text (Description)</label>
                    <input type="text" id="editImgAlt" value="${img.alt || ''}" placeholder="Describe the image">
                </div>
                
                <div class="form-field">
                    <label>Width (optional)</label>
                    <input type="text" id="editImgWidth" value="${img.style.width || img.getAttribute('width') || ''}" placeholder="e.g. 200px or 50%">
                </div>
                
                <div class="modal-actions">
                    <button id="browseImgBtn" class="btn-secondary"><ion-icon name="folder-outline"></ion-icon> Browse Assets</button>
                    <button id="cancelImgEditBtn" class="btn-secondary">Cancel</button>
                    <button id="applyImgEditBtn" class="btn-primary">Apply Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event handlers
        document.getElementById('cancelImgEditBtn').onclick = () => modal.remove();

        document.getElementById('applyImgEditBtn').onclick = () => {
            const newSrc = document.getElementById('editImgSrc').value;
            const newAlt = document.getElementById('editImgAlt').value;
            const newWidth = document.getElementById('editImgWidth').value;

            if (newSrc) img.src = newSrc;
            img.alt = newAlt;
            if (newWidth) {
                img.style.width = newWidth;
            }

            this.showNotification('Image updated!', 'success');
            modal.remove();
        };

        // Browse assets
        document.getElementById('browseImgBtn').onclick = async () => {
            try {
                const res = await window.rtocFetch('/api/assets');
                const data = await res.json();

                if (data.status === 'success' && data.assets.length > 0) {
                    const assetList = modal.querySelector('.modal-content');
                    const existing = modal.querySelector('.asset-gallery');
                    if (existing) existing.remove();

                    const gallery = document.createElement('div');
                    gallery.className = 'asset-gallery';
                    gallery.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; max-height: 200px; overflow-y: auto;';

                    data.assets.forEach(asset => {
                        const item = document.createElement('div');
                        item.style.cssText = 'cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid transparent; transition: all 0.2s;';
                        item.innerHTML = `<img src="${asset.url}" style="width: 100%; height: 80px; object-fit: cover;">`;
                        item.onclick = () => {
                            document.getElementById('editImgSrc').value = asset.url;
                            gallery.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
                            item.style.borderColor = '#8B5CF6';
                        };
                        gallery.appendChild(item);
                    });

                    assetList.insertBefore(gallery, assetList.querySelector('.modal-actions'));
                } else {
                    this.showNotification('No assets found', 'warning');
                }
            } catch (e) {
                this.showNotification('Failed to load assets', 'error');
            }
        };
    }

    wrapSelectionInSpoiler() {
        if (!this.isEditorActive) return;
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            this.showNotification('Select text first!', 'warning');
            return;
        }
        const range = selection.getRangeAt(0);
        const fragment = range.extractContents();
        const spoilerDiv = document.createElement('div');
        spoilerDiv.classList.add('spoiler');
        spoilerDiv.appendChild(fragment);
        range.insertNode(spoilerDiv);
        selection.removeAllRanges();
        this.showNotification('Spoiler created', 'success');
    }

    formatText(command) {
        if (!this.isEditorActive) return;
        document.execCommand(command, false, null);
    }

    formatBlock(tag) {
        if (!this.isEditorActive) return;
        document.execCommand('formatBlock', false, `<${tag}>`);
    }

    // Enhanced Formatting Functions
    applyFontFamily() {
        if (!this.isEditorActive) return;
        const fontFamily = document.getElementById('fontFamilySelect').value;
        if (!fontFamily) {
            this.showNotification('Please select a font family', 'warning');
            return;
        }
        this.restoreSelection();
        document.execCommand('fontName', false, fontFamily);
        this.closeModal('fontFamilyModal');
        this.showNotification('Font family applied', 'success');
    }

    applyFontSize() {
        if (!this.isEditorActive) return;
        const fontSize = document.getElementById('fontSizeInput').value.trim();
        if (!fontSize) {
            this.showNotification('Please enter a font size', 'warning');
            return;
        }
        this.restoreSelection();
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);

            // Try to use CSS for font size if possible
            const span = document.createElement('span');
            span.style.fontSize = fontSize;
            try {
                const contents = range.extractContents();
                span.appendChild(contents);
                range.insertNode(span);
            } catch (e) {
                // Fallback for complex selections
                document.execCommand('fontSize', false, '3');
                const fontElements = document.querySelectorAll('font[size="3"]');
                fontElements.forEach(el => {
                    el.style.fontSize = fontSize;
                    el.removeAttribute('size');
                });
            }
        } else {
            // Apply to current element
            const activeElement = document.activeElement;
            if (activeElement && activeElement.contentEditable === 'true') {
                activeElement.style.fontSize = fontSize;
            }
        }
        this.closeModal('fontSizeModal');
        this.showNotification('Font size applied', 'success');
    }

    applyLineSpacing() {
        if (!this.isEditorActive) return;
        const lineSpacing = document.getElementById('lineSpacingInput').value.trim();
        if (!lineSpacing) {
            this.showNotification('Please enter line spacing', 'warning');
            return;
        }
        this.restoreSelection();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let container = range.commonAncestorContainer;

            // Find the closest block-level parent
            while (container && container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentElement;
            }

            // If it's an inline element, go up to the block element
            const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD'];
            while (container && container !== document.body && !blockTags.includes(container.tagName)) {
                container = container.parentElement;
            }

            if (container && container !== document.body) {
                container.style.lineHeight = lineSpacing;
            } else {
                // Fallback: apply to current element if possible
                const activeElement = document.activeElement;
                if (activeElement && activeElement.contentEditable === 'true') {
                    activeElement.style.lineHeight = lineSpacing;
                }
            }
        }
        this.closeModal('lineSpacingModal');
        this.showNotification('Line spacing applied', 'success');
    }

    applyTextColor() {
        if (!this.isEditorActive) return;
        const color = document.getElementById('textColorInput').value.trim();
        if (!color) {
            this.showNotification('Please enter a color', 'warning');
            return;
        }
        this.restoreSelection();
        document.execCommand('foreColor', false, color);
        this.closeModal('textColorModal');
        this.showNotification('Text color applied', 'success');
    }

    applyBgColor() {
        if (!this.isEditorActive) return;
        const color = document.getElementById('bgColorInput').value.trim();
        if (!color) {
            this.showNotification('Please enter a color', 'warning');
            return;
        }
        this.restoreSelection();
        document.execCommand('backColor', false, color);
        this.closeModal('bgColorModal');
        this.showNotification('Background color applied', 'success');
    }

    applyAlignment(align) {
        if (!this.isEditorActive) return;
        this.saveSelection();
        document.execCommand('justifyLeft');
        if (align === 'center') {
            document.execCommand('justifyCenter');
        } else if (align === 'right') {
            document.execCommand('justifyRight');
        } else if (align === 'justify') {
            document.execCommand('justifyFull');
        }
        this.restoreSelection();
        this.showNotification(`Text aligned ${align}`, 'success');
    }

    openTextAlignModal() {
        // Simple alignment picker
        const align = prompt('Choose alignment:\n1. Left\n2. Center\n3. Right\n4. Justify\n\nEnter 1-4:');
        if (align === '1') this.applyAlignment('left');
        else if (align === '2') this.applyAlignment('center');
        else if (align === '3') this.applyAlignment('right');
        else if (align === '4') this.applyAlignment('justify');
    }

    getContextTargetImage() {
        // Get image from context menu target
        if (this.contextMenuTarget && this.contextMenuTarget.tagName === 'IMG') {
            return this.contextMenuTarget;
        }
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            const img = node.closest('img');
            if (img) return img;
        }
        return null;
    }

    getSelectedImage() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            const img = node.closest('img');
            if (img) return img;
        }
        return null;
    }

    showEnhancedImageEdit(img) {
        this.currentEditingImage = img;
        this.populateImageEditModal(img);
        this.openModal('enhancedImageEditModal');
    }

    populateImageEditModal(img) {
        document.getElementById('enhancedImgPreview').src = img.src;
        document.getElementById('enhancedImgSrc').value = img.src;
        document.getElementById('enhancedImgAlt').value = img.alt || '';
        document.getElementById('enhancedImgWidth').value = img.style.width || img.getAttribute('width') || '';
        document.getElementById('enhancedImgHeight').value = img.style.height || img.getAttribute('height') || '';

        // Get alignment
        const align = img.style.float || img.style.textAlign || img.getAttribute('align') || '';
        document.getElementById('enhancedImgAlign').value = align;

        // Get border radius
        const borderRadius = img.style.borderRadius || '';
        document.getElementById('enhancedImgBorderRadius').value = borderRadius;
    }

    applyEnhancedImageEdit() {
        if (!this.currentEditingImage) {
            this.showNotification('No image selected', 'warning');
            return;
        }

        const img = this.currentEditingImage;
        const src = document.getElementById('enhancedImgSrc').value;
        const alt = document.getElementById('enhancedImgAlt').value;
        const width = document.getElementById('enhancedImgWidth').value;
        const height = document.getElementById('enhancedImgHeight').value;
        const align = document.getElementById('enhancedImgAlign').value;
        const borderRadius = document.getElementById('enhancedImgBorderRadius').value;

        if (src) img.src = src;
        img.alt = alt;

        if (width) img.style.width = width;
        else img.style.width = '';

        if (height) img.style.height = height;
        else img.style.height = '';

        if (align) {
            img.style.float = align;
            img.style.display = 'block';
            if (align === 'center') {
                img.style.margin = '0 auto';
                img.style.float = 'none';
            }
        } else {
            img.style.float = '';
            img.style.display = '';
            img.style.margin = '';
        }

        if (borderRadius) img.style.borderRadius = borderRadius;
        else img.style.borderRadius = '';

        this.showNotification('Image updated!', 'success');
        this.closeModal('enhancedImageEditModal');
        this.currentEditingImage = null;
    }

    async browseAssetsForEnhancedImage() {
        try {
            const res = await window.rtocFetch('/api/assets');
            const data = await res.json();

            if (data.status === 'success' && data.assets.length > 0) {
                const modal = document.getElementById('enhancedImageEditModal');
                const existing = modal.querySelector('.asset-gallery');
                if (existing) existing.remove();

                const gallery = document.createElement('div');
                gallery.className = 'asset-gallery';
                gallery.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; max-height: 200px; overflow-y: auto;';

                data.assets.forEach(asset => {
                    const item = document.createElement('div');
                    item.style.cssText = 'cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid transparent; transition: all 0.2s;';
                    item.innerHTML = `<img src="${asset.url}" style="width: 100%; height: 80px; object-fit: cover;">`;
                    item.onclick = () => {
                        document.getElementById('enhancedImgSrc').value = asset.url;
                        document.getElementById('enhancedImgPreview').src = asset.url;
                        gallery.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
                        item.style.borderColor = '#8B5CF6';
                    };
                    gallery.appendChild(item);
                });

                const modalContent = modal.querySelector('.modal-content');
                modalContent.insertBefore(gallery, modalContent.querySelector('.modal-actions'));
            } else {
                this.showNotification('No assets found', 'warning');
            }
        } catch (e) {
            this.showNotification('Failed to load assets', 'error');
        }
    }

    saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
        }
    }

    restoreSelection() {
        if (this.savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedRange);
        }
    }

    insertLink() {
        const text = document.getElementById('linkText').value;
        const url = document.getElementById('linkUrl').value;
        if (!url) {
            this.showNotification('Please enter a URL', 'warning');
            return;
        }
        this.restoreSelection();
        const link = document.createElement('a');
        link.href = url;
        link.textContent = text || url;
        link.target = '_blank';
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(link);
        }
        this.closeModal('insertLinkModal');
        this.showNotification('Link inserted', 'success');
    }

    async handleFileUpload(file) {
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please upload an image file', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        this.showNotification('Uploading...', 'info');

        try {
            const res = await window.rtocFetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.showNotification('Upload Complete', 'success');
                this.uploadedImageUrl = data.url;

                // Update preview
                const preview = document.getElementById('uploadPreview');
                preview.style.display = 'flex';
                preview.querySelector('img').src = data.url;
                preview.querySelector('span').textContent = data.filename;
            } else {
                throw new Error(data.message || 'Upload failed');
            }
        } catch (e) {
            console.error(e);
            this.showNotification('Upload Error: ' + e.message, 'error');
        }
    }

    triggerSlideUpload() {
        if (!this.contextTargetCarousel) {
            this.showNotification('No carousel selected', 'warning');
            return;
        }

        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length) {
                await this.handleCarouselUpload(e.target.files[0], this.contextTargetCarousel);
            }
            fileInput.remove();
        });

        fileInput.click();
    }

    async handleCarouselUpload(file, carousel) {
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please upload an image file', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        this.showNotification('Uploading slide...', 'info');

        try {
            const res = await window.rtocFetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.status === 'success') {
                // Find the carousel track
                const track = carousel.querySelector('.carousel-track');
                if (!track) {
                    this.showNotification('Carousel structure not found', 'error');
                    return;
                }

                // Get caption from user
                const captionText = prompt('Enter caption for this image:', 'Character Art') || 'Character Art';

                // Remove 'active' from all existing images
                track.querySelectorAll('.carousel-img').forEach(img => img.classList.remove('active'));

                // Create new image element
                const newImg = document.createElement('img');
                newImg.src = data.url;
                newImg.alt = 'Character Image';
                newImg.className = 'carousel-img active';
                newImg.dataset.caption = captionText;
                track.appendChild(newImg);

                // Get all images count
                const images = track.querySelectorAll('.carousel-img');
                const imageCount = images.length;

                // Add navigation buttons if this is the second image (first multi-image)
                if (imageCount === 2 && !carousel.querySelector('.carousel-btn')) {
                    const prevBtn = document.createElement('button');
                    prevBtn.className = 'carousel-btn prev';
                    prevBtn.title = 'Previous';
                    prevBtn.innerHTML = '<ion-icon name="chevron-back-outline"></ion-icon>';

                    const nextBtn = document.createElement('button');
                    nextBtn.className = 'carousel-btn next';
                    nextBtn.title = 'Next';
                    nextBtn.innerHTML = '<ion-icon name="chevron-forward-outline"></ion-icon>';

                    carousel.appendChild(prevBtn);
                    carousel.appendChild(nextBtn);
                }

                // Update or create indicators
                let indicators = carousel.querySelector('.carousel-indicators');
                if (!indicators) {
                    indicators = document.createElement('div');
                    indicators.className = 'carousel-indicators';
                    carousel.appendChild(indicators);
                }

                // Rebuild all dots
                indicators.innerHTML = '';
                images.forEach((img, index) => {
                    const dot = document.createElement('span');
                    dot.className = 'dot' + (img.classList.contains('active') ? ' active' : '');
                    dot.dataset.index = index;
                    indicators.appendChild(dot);
                });

                // Update caption
                const caption = document.getElementById('carousel-caption');
                if (caption) {
                    caption.textContent = captionText;
                }

                this.showNotification('Slide added! Saving...', 'success');

                // Auto-save the page
                await this.saveChanges();
            } else {
                throw new Error(data.message || 'Upload failed');
            }
        } catch (e) {
            console.error(e);
            this.showNotification('Upload Error: ' + e.message, 'error');
        }
    }



    async loadGallery() {
        const grid = document.getElementById('galleryGrid');
        grid.innerHTML = '<p style="color: #aaa; grid-column: 1/-1;">Loading...</p>';

        try {
            const res = await window.rtocFetch('/api/assets');
            const data = await res.json();

            if (data.status === 'success') {
                grid.innerHTML = '';
                data.assets.forEach(asset => {
                    const item = document.createElement('div');
                    item.className = 'gallery-item';
                    item.innerHTML = `
                        <img src="${asset.url}" loading="lazy" style="width:100%; height:80px; object-fit:cover; border-radius:4px; border:2px solid transparent; cursor:pointer;">
                    `;
                    item.onclick = () => {
                        grid.querySelectorAll('img').forEach(img => img.style.borderColor = 'transparent');
                        item.querySelector('img').style.borderColor = '#8B5CF6';
                        this.galleryImageUrl = asset.url;
                    };
                    grid.appendChild(item);
                });
            }
        } catch (e) {
            grid.innerHTML = '<p style="color: #EF4444; grid-column: 1/-1;">Failed to load gallery</p>';
        }
    }

    insertImage() {
        // Determine active tab
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        let url = '';

        if (activeTab === 'img-url') {
            url = document.getElementById('imageUrl').value;
        } else if (activeTab === 'img-upload') {
            url = this.uploadedImageUrl;
        } else if (activeTab === 'img-gallery') {
            url = this.galleryImageUrl;
        }

        const alt = document.getElementById('imageAlt').value || 'Image';

        if (!url) {
            this.showNotification('Please select or enter an image', 'warning');
            return;
        }

        this.restoreSelection();
        const img = document.createElement('img');
        img.src = url;
        img.alt = alt;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';

        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
        }

        this.closeModal('insertImageModal');
        this.showNotification('Image inserted', 'success');

        // Reset state
        this.uploadedImageUrl = '';
        this.galleryImageUrl = '';
        document.getElementById('imageUrl').value = '';
        document.getElementById('uploadPreview').style.display = 'none';
    }

    cancelEdit() {
        if (confirm('Are you sure? Unsaved changes will be lost.')) {
            location.reload();
        }
    }

    async saveChanges() {
        if (!this.isEditorActive) return;
        this.setEditableState(false);
        document.body.classList.remove('is-editing');

        // Remove UI elements before saving
        const elementsToRemove = [
            'adminEditor', 'adminContextMenu', 'createPageModal',
            'addCharacterModal', 'insertLinkModal', 'insertImageModal', 'editorStyles'
        ];
        const removed = {};
        elementsToRemove.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                removed[id] = { element: el, parent: el.parentNode, sibling: el.nextSibling };
                el.remove();
            }
        });
        document.querySelectorAll('.editor-notification').forEach(n => n.remove());

        // Remove editable-zone classes
        document.querySelectorAll('.editable-zone').forEach(el => el.classList.remove('editable-zone'));

        const fullContent = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

        // Restore UI elements
        Object.values(removed).forEach(({ element, parent, sibling }) => {
            if (sibling) parent.insertBefore(element, sibling);
            else parent.appendChild(element);
        });

        let filePath = window.location.pathname;
        if (filePath.startsWith('/')) filePath = filePath.substring(1);
        if (!filePath || filePath === '/') filePath = 'index.html';

        const user = JSON.parse(localStorage.getItem('rtoc_user') || 'null');

        // Wake up Render server if it's sleeping (free tier cold start)
        this.showNotification('Connecting to server...', 'info');
        if (window.rtocWakeServer) {
            await window.rtocWakeServer();
        }

        this.showNotification('Saving...', 'info');

        const maxRetries = 3;
        let saved = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await window.rtocFetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: filePath,
                        content: fullContent,
                        user: user
                    })
                });

                if (response.ok) {
                    saved = true;
                    this.showNotification('Saved!', 'success');
                    const layoutContainer = document.querySelector('.character-layout');
                    if (layoutContainer) this.originalLayoutHTML = layoutContainer.innerHTML;

                    this.isEditorActive = false;
                    const controls = document.getElementById('editorControls');
                    if (controls) controls.style.display = 'none';
                    const toggleBtn = document.getElementById('toggleEditor');
                    if (toggleBtn) {
                        toggleBtn.classList.remove('active');
                        toggleBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon><span>Edit Mode</span>';
                    }
                    localStorage.removeItem('wiki_autosave_' + window.location.pathname);
                    break;
                } else if (response.status === 403) {
                    alert("Your session has expired or is invalid. You will be logged out to refresh your session. Please log in again.");
                    window.location.href = '/?logout=true';
                    break; // Don't retry auth errors
                } else {
                    throw new Error(`Server error: ${response.status}`);
                }
            } catch (e) {
                console.error(`Save attempt ${attempt}/${maxRetries} failed:`, e);
                if (attempt < maxRetries) {
                    this.showNotification(`Save failed, retrying (${attempt}/${maxRetries})...`, 'warning');
                    await new Promise(r => setTimeout(r, attempt * 3000));
                }
            }
        }

        if (!saved) {
            this.showNotification('Save Failed! Server may be starting up — try again in a minute.', 'error');
            this.isEditorActive = true;
            document.body.classList.add('is-editing');
            this.setEditableState(true);
        }
        this.reattachSpoilerListeners();
    }

    reattachSpoilerListeners() {
        document.querySelectorAll('.spoiler').forEach(spoiler => {
            spoiler.onclick = function () {
                if (!document.body.classList.contains('is-editing')) {
                    this.classList.toggle('revealed');
                }
            };
        });
    }

    showNotification(msg, type) {
        let notif = document.querySelector('.editor-notification');
        if (notif) notif.remove();

        const colors = {
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6'
        };

        notif = document.createElement('div');
        notif.className = 'editor-notification';
        notif.innerHTML = msg;
        notif.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${colors[type] || colors.info};
            color: white;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10002;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(notif);

        requestAnimationFrame(() => {
            notif.style.transform = 'translateY(0)';
            notif.style.opacity = '1';
        });

        setTimeout(() => {
            notif.style.transform = 'translateY(100px)';
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }
}

class SlashMenu {
    constructor(editor) {
        this.editor = editor;
        this.active = false;
        this.menu = null;
        this.selectedIndex = 0;
        this.commands = [
            { id: 'h1', icon: 'text-outline', label: 'Heading 1', action: () => editor.formatBlock('h1') },
            { id: 'h2', icon: 'text-outline', label: 'Heading 2', action: () => editor.formatBlock('h2') },
            { id: 'h3', icon: 'text-outline', label: 'Heading 3', action: () => editor.formatBlock('h3') },
            { id: 'p', icon: 'paragraph-outline', label: 'Paragraph', action: () => editor.formatBlock('p') },
            { id: 'image', icon: 'image-outline', label: 'Image', action: () => editor.openModal('insertImageModal') },
            { id: 'link', icon: 'link-outline', label: 'Link', action: () => editor.openModal('insertLinkModal') },
            { id: 'spoiler', icon: 'eye-off-outline', label: 'Spoiler', action: () => editor.wrapSelectionInSpoiler() },
            { id: 'hr', icon: 'remove-outline', label: 'Divider', action: () => document.execCommand('insertHorizontalRule') }
        ];
        this.init();
    }

    init() {
        this.createMenu();
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('input', (e) => this.onInput(e));
        document.addEventListener('click', () => this.hide());
    }

    createMenu() {
        this.menu = document.createElement('div');
        this.menu.className = 'slash-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .slash-menu {
                position: fixed;
                z-index: 10005;
                background: #1a1a24;
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                width: 200px;
                overflow: hidden;
            }
            .slash-item {
                padding: 10px 15px;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                color: #ccc;
                font-size: 0.9rem;
                transition: all 0.1s;
            }
            .slash-item:hover, .slash-item.selected {
                background: rgba(139, 92, 246, 0.2);
                color: #fff;
            }
            .slash-item ion-icon {
                font-size: 1.1rem;
                color: #8B5CF6;
            }
        `;
        document.head.appendChild(style);
    }

    show(x, y) {
        this.menu.innerHTML = this.commands.map((cmd, i) => `
            <div class="slash-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
                <ion-icon name="${cmd.icon}"></ion-icon>
                <span>${cmd.label}</span>
            </div>
        `).join('');

        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y + 24}px`; // Below cursor
        this.active = true;
        this.selectedIndex = 0;

        this.menu.querySelectorAll('.slash-item').forEach((item, i) => {
            item.onclick = () => this.execute(i);
        });
    }

    hide() {
        if (this.menu) this.menu.style.display = 'none';
        this.active = false;
    }

    onInput(e) {
        if (!this.editor.isEditorActive) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        // Detect '/'
        if (e.data === '/') {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            this.show(rect.left, rect.top);
        } else {
            // Hide if typing other things (implied, or filter commands)
            // For now, simpler: just show on '/' and hide on execute or click away
            // Real Notion filters as you type. 
            // We'll stick to simple trigger for now.
        }
    }

    onKeyDown(e) {
        if (!this.active) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.commands.length;
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.commands.length) % this.commands.length;
            this.updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.execute(this.selectedIndex);
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    updateSelection() {
        const items = this.menu.querySelectorAll('.slash-item');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === this.selectedIndex);
        });
    }

    execute(index) {
        const cmd = this.commands[index];
        if (cmd) {
            // Remove the '/' character before executing
            // This is tricky. We need to find the '/' we just typed.
            // Assumption: cursor is right after '/'
            document.execCommand('delete'); // delete the slash
            cmd.action();
        }
        this.hide();
    }
}

// Section Editor - Adds [Edit] buttons next to headings for section-specific editing
class SectionEditor {
    constructor(editor) {
        this.editor = editor;
        this.activeSection = null;
        this.init();
    }

    init() {
        this.injectStyles();
        this.addSectionEditButtons();
    }

    injectStyles() {
        if (document.getElementById('sectionEditorStyles')) return;

        const style = document.createElement('style');
        style.id = 'sectionEditorStyles';
        style.textContent = `
            .section-edit-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                margin-left: 10px;
                background: transparent;
                border: 1px solid rgba(139, 92, 246, 0.3);
                color: #8B5CF6;
                font-size: 0.75rem;
                font-weight: 500;
                border-radius: 4px;
                cursor: pointer;
                opacity: 0;
                transition: all 0.2s;
                vertical-align: middle;
            }
            h2:hover .section-edit-btn,
            h3:hover .section-edit-btn,
            .section-edit-btn:focus {
                opacity: 1;
            }
            .section-edit-btn:hover {
                background: rgba(139, 92, 246, 0.2);
                border-color: #8B5CF6;
            }
            .section-editing {
                outline: 2px solid #8B5CF6 !important;
                background: rgba(139, 92, 246, 0.05) !important;
                border-radius: 8px;
                padding: 10px;
                margin: 10px 0;
            }
            .section-editing-toolbar {
                display: flex;
                gap: 8px;
                margin-bottom: 10px;
                padding: 8px;
                background: rgba(26, 31, 46, 0.95);
                border-radius: 6px;
                border: 1px solid rgba(139, 92, 246, 0.3);
            }
            .section-editing-toolbar button {
                padding: 6px 12px;
                background: transparent;
                border: 1px solid rgba(255,255,255,0.2);
                color: #fff;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
            }
            .section-editing-toolbar button:hover {
                background: rgba(139, 92, 246, 0.2);
            }
            .section-editing-toolbar button.primary {
                background: linear-gradient(135deg, #8B5CF6, #6D28D9);
                border: none;
            }
        `;
        document.head.appendChild(style);
    }

    addSectionEditButtons() {
        // Add edit buttons to all h2 and h3 headings
        document.querySelectorAll('main h2, main h3, .section h2, .section h3, .cultivation-content h2, .cultivation-content h3').forEach(heading => {
            // Skip if already has button
            if (heading.querySelector('.section-edit-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'section-edit-btn';
            btn.innerHTML = '<ion-icon name="create-outline"></ion-icon> Edit';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.editSection(heading);
            };
            heading.appendChild(btn);
        });
    }

    getSectionContent(heading) {
        // Get all content between this heading and the next heading of same or higher level
        const elements = [];
        let el = heading.nextElementSibling;
        const headingLevel = parseInt(heading.tagName[1]);

        while (el) {
            const isHeading = /^H[1-6]$/.test(el.tagName);
            if (isHeading && parseInt(el.tagName[1]) <= headingLevel) {
                break;
            }
            elements.push(el);
            el = el.nextElementSibling;
        }
        return elements;
    }

    editSection(heading) {
        if (this.activeSection) {
            this.closeSectionEdit();
        }

        // Create a wrapper for the section content
        const sectionContent = this.getSectionContent(heading);

        // Create section container
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'section-editing';
        sectionContainer.id = 'activeSectionEdit';

        // Create mini toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'section-editing-toolbar';
        toolbar.innerHTML = `
            <button onclick="document.execCommand('bold')"><b>B</b></button>
            <button onclick="document.execCommand('italic')"><i>I</i></button>
            <button onclick="document.execCommand('underline')"><u>U</u></button>
            <button onclick="document.execCommand('insertUnorderedList')">• List</button>
            <button onclick="document.execCommand('insertOrderedList')">1. List</button>
            <div style="flex:1"></div>
            <button class="primary" id="saveSectionBtn">Save Section</button>
            <button id="cancelSectionBtn">Cancel</button>
        `;

        // Store original content
        this.originalSectionContent = [];
        sectionContent.forEach(el => {
            this.originalSectionContent.push(el.outerHTML);
        });
        this.activeSection = { heading, elements: sectionContent };

        // Wrap content
        heading.parentNode.insertBefore(sectionContainer, heading.nextSibling);
        sectionContainer.appendChild(toolbar);

        // Move elements into container and make editable
        sectionContent.forEach(el => {
            sectionContainer.appendChild(el);
            el.contentEditable = 'true';
            el.classList.add('editable-zone');
        });

        // Add event listeners
        document.getElementById('saveSectionBtn').onclick = () => this.saveSection();
        document.getElementById('cancelSectionBtn').onclick = () => this.closeSectionEdit(true);

        // Update button text
        const editBtn = heading.querySelector('.section-edit-btn');
        if (editBtn) {
            editBtn.innerHTML = '<ion-icon name="close-outline"></ion-icon> Editing...';
            editBtn.style.opacity = '1';
            editBtn.style.background = 'rgba(139, 92, 246, 0.3)';
        }

        this.editor.showNotification('Section editing mode - edit and save this section only', 'info');
    }

    async saveSection() {
        if (!this.activeSection) return;

        // Remove editable state
        const container = document.getElementById('activeSectionEdit');
        if (!container) return;

        // Move elements back out and remove editable
        const toolbar = container.querySelector('.section-editing-toolbar');
        toolbar.remove();

        // Get all children except heading
        const elements = Array.from(container.children);

        // Insert elements back after heading
        let insertPoint = this.activeSection.heading;
        elements.forEach(el => {
            el.contentEditable = 'false';
            el.classList.remove('editable-zone');
            insertPoint.parentNode.insertBefore(el, container);
        });

        container.remove();

        // Reset button
        const editBtn = this.activeSection.heading.querySelector('.section-edit-btn');
        if (editBtn) {
            editBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon> Edit';
            editBtn.style.opacity = '';
            editBtn.style.background = '';
        }

        this.activeSection = null;
        this.originalSectionContent = null;

        // Save the entire page
        await this.editor.saveChanges();
    }

    closeSectionEdit(restore = false) {
        if (!this.activeSection) return;

        const container = document.getElementById('activeSectionEdit');
        if (!container) return;

        if (restore && this.originalSectionContent) {
            // Restore original content
            const elements = this.activeSection.elements;
            elements.forEach((el, i) => {
                if (this.originalSectionContent[i]) {
                    el.outerHTML = this.originalSectionContent[i];
                }
            });
        }

        // Move elements back
        const toolbar = container.querySelector('.section-editing-toolbar');
        if (toolbar) toolbar.remove();

        Array.from(container.children).forEach(el => {
            el.contentEditable = 'false';
            el.classList.remove('editable-zone');
            this.activeSection.heading.parentNode.insertBefore(el, container);
        });

        container.remove();

        // Reset button
        const editBtn = this.activeSection.heading.querySelector('.section-edit-btn');
        if (editBtn) {
            editBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon> Edit';
            editBtn.style.opacity = '';
            editBtn.style.background = '';
        }

        this.activeSection = null;
        this.originalSectionContent = null;

        this.editor.showNotification('Section edit cancelled', 'info');
    }
}

// Image Editor - Click-to-edit images
class ImageEditor {
    constructor(editor) {
        this.editor = editor;
        this.init();
    }

    init() {
        this.injectStyles();
        this.createImageModal();
        this.attachImageListeners();
    }

    injectStyles() {
        if (document.getElementById('imageEditorStyles')) return;

        const style = document.createElement('style');
        style.id = 'imageEditorStyles';
        style.textContent = `
            .is-editing img:not(.nav-logo-img) {
                cursor: pointer;
                position: relative;
                transition: all 0.2s;
            }
            .is-editing img:not(.nav-logo-img):hover {
                outline: 3px solid #8B5CF6;
                outline-offset: 3px;
            }
            .is-editing img:not(.nav-logo-img)::after {
                content: 'Click to edit';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(139, 92, 246, 0.9);
                color: white;
                padding: 4px;
                font-size: 12px;
                text-align: center;
            }
            .image-edit-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.2s;
                pointer-events: none;
                border-radius: inherit;
            }
            .is-editing .image-wrapper:hover .image-edit-overlay {
                opacity: 1;
            }
            .image-edit-overlay span {
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 0.9rem;
                font-weight: 500;
            }
            .image-placeholder {
                width: 200px;
                height: 200px;
                background: repeating-linear-gradient(
                    45deg,
                    rgba(139, 92, 246, 0.1),
                    rgba(139, 92, 246, 0.1) 10px,
                    rgba(139, 92, 246, 0.05) 10px,
                    rgba(139, 92, 246, 0.05) 20px
                );
                border: 2px dashed rgba(139, 92, 246, 0.5);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 10px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .image-placeholder:hover {
                border-color: #8B5CF6;
                background: rgba(139, 92, 246, 0.1);
            }
            .image-placeholder ion-icon {
                font-size: 3rem;
                color: #8B5CF6;
            }
            .image-placeholder span {
                color: #8B5CF6;
                font-weight: 500;
            }
        `;
        document.head.appendChild(style);
    }

    createImageModal() {
        if (document.getElementById('editImageModal')) return;

        const modalHTML = `
            <div id="editImageModal" class="admin-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <h3><ion-icon name="image-outline"></ion-icon> Edit Image</h3>
                    
                    <div id="currentImagePreview" style="margin: 1rem 0; text-align: center;">
                        <img id="editImagePreview" src="" alt="Current image" style="max-width: 100%; max-height: 200px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    </div>
                    
                    <div class="form-field">
                        <label>Image URL</label>
                        <input type="text" id="editImageUrl" placeholder="https://... or /assets/images/...">
                    </div>
                    
                    <div class="form-field">
                        <label>Or Upload New Image</label>
                        <div id="editImageDropZone" style="border: 2px dashed rgba(139, 92, 246, 0.4); border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s;">
                            <ion-icon name="cloud-upload-outline" style="font-size: 2rem; color: #8B5CF6;"></ion-icon>
                            <p style="margin: 0.5rem 0; color: #aaa;">Drop image or click to upload</p>
                            <input type="file" id="editFileInput" accept="image/*" style="display: none;">
                        </div>
                    </div>
                    
                    <div class="form-field">
                        <label>Alt Text (for accessibility)</label>
                        <input type="text" id="editImageAlt" placeholder="Describe the image">
                    </div>
                    
                    <div class="modal-actions">
                        <button id="deleteImageBtn" class="btn-secondary" style="margin-right: auto; color: #EF4444; border-color: #EF4444;">Delete</button>
                        <button id="cancelEditImageBtn" class="btn-secondary">Cancel</button>
                        <button id="confirmEditImageBtn" class="btn-primary">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Attach modal events
        this.attachModalEvents();
    }

    attachModalEvents() {
        const modal = document.getElementById('editImageModal');
        const dropZone = document.getElementById('editImageDropZone');
        const fileInput = document.getElementById('editFileInput');

        dropZone.onclick = () => fileInput.click();

        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#8B5CF6';
            dropZone.style.background = 'rgba(139, 92, 246, 0.1)';
        };

        dropZone.ondragleave = () => {
            dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
            dropZone.style.background = '';
        };

        dropZone.ondrop = async (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
            dropZone.style.background = '';
            if (e.dataTransfer.files.length) {
                await this.uploadImage(e.dataTransfer.files[0]);
            }
        };

        fileInput.onchange = async (e) => {
            if (e.target.files.length) {
                await this.uploadImage(e.target.files[0]);
            }
        };

        document.getElementById('cancelEditImageBtn').onclick = () => this.closeModal();
        document.getElementById('confirmEditImageBtn').onclick = () => this.saveImageChanges();
        document.getElementById('deleteImageBtn').onclick = () => this.deleteImage();

        // Update preview on URL change
        document.getElementById('editImageUrl').oninput = (e) => {
            document.getElementById('editImagePreview').src = e.target.value;
        };
    }

    attachImageListeners() {
        // Use event delegation for dynamic content
        document.body.addEventListener('click', (e) => {
            if (!this.editor.isEditorActive) return;

            const img = e.target.closest('img');
            if (!img) return;

            // Skip nav logo
            if (img.classList.contains('nav-logo-img')) return;

            e.preventDefault();
            e.stopPropagation();
            this.openImageEditor(img);
        });
    }

    openImageEditor(img) {
        this.currentImage = img;

        const modal = document.getElementById('editImageModal');
        const preview = document.getElementById('editImagePreview');
        const urlInput = document.getElementById('editImageUrl');
        const altInput = document.getElementById('editImageAlt');

        preview.src = img.src;
        urlInput.value = img.src;
        altInput.value = img.alt || '';

        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('editImageModal').classList.remove('active');
        this.currentImage = null;
        this.uploadedUrl = null;
    }

    async uploadImage(file) {
        if (!file.type.startsWith('image/')) {
            this.editor.showNotification('Please upload an image file', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        this.editor.showNotification('Uploading...', 'info');

        try {
            const res = await window.rtocFetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.editor.showNotification('Upload Complete', 'success');
                this.uploadedUrl = data.url;
                document.getElementById('editImageUrl').value = data.url;
                document.getElementById('editImagePreview').src = data.url;
            } else {
                throw new Error(data.message || 'Upload failed');
            }
        } catch (e) {
            console.error(e);
            this.editor.showNotification('Upload Error: ' + e.message, 'error');
        }
    }

    saveImageChanges() {
        if (!this.currentImage) return;

        const newUrl = document.getElementById('editImageUrl').value;
        const newAlt = document.getElementById('editImageAlt').value;

        if (!newUrl) {
            this.editor.showNotification('Please enter an image URL', 'warning');
            return;
        }

        this.currentImage.src = newUrl;
        this.currentImage.alt = newAlt;

        this.editor.showNotification('Image updated! Remember to save the page.', 'success');
        this.closeModal();
    }

    deleteImage() {
        if (!this.currentImage) return;

        if (confirm('Delete this image?')) {
            // Create placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'image-placeholder';
            placeholder.innerHTML = `
                <ion-icon name="image-outline"></ion-icon>
                <span>Click to add image</span>
            `;
            placeholder.onclick = () => this.addNewImage(placeholder);

            this.currentImage.parentNode.replaceChild(placeholder, this.currentImage);
            this.editor.showNotification('Image removed', 'info');
            this.closeModal();
        }
    }

    addNewImage(placeholder) {
        // Open the image modal for adding a new image
        this.currentImage = null;
        this.placeholderToReplace = placeholder;

        const modal = document.getElementById('editImageModal');
        document.getElementById('editImagePreview').src = '';
        document.getElementById('editImageUrl').value = '';
        document.getElementById('editImageAlt').value = '';
        document.getElementById('deleteImageBtn').style.display = 'none';

        // Override save to insert new image
        document.getElementById('confirmEditImageBtn').onclick = () => this.insertNewImage();

        modal.classList.add('active');
    }

    insertNewImage() {
        const url = document.getElementById('editImageUrl').value;
        const alt = document.getElementById('editImageAlt').value;

        if (!url) {
            this.editor.showNotification('Please enter an image URL', 'warning');
            return;
        }

        const img = document.createElement('img');
        img.src = url;
        img.alt = alt || 'Image';
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';

        if (this.placeholderToReplace) {
            this.placeholderToReplace.parentNode.replaceChild(img, this.placeholderToReplace);
            this.placeholderToReplace = null;
        }

        // Reset modal
        document.getElementById('deleteImageBtn').style.display = '';
        document.getElementById('confirmEditImageBtn').onclick = () => this.saveImageChanges();

        this.editor.showNotification('Image added! Remember to save the page.', 'success');
        this.closeModal();
    }
}

// Initialize
const editorInstance = new WikiEditor();
window.WikiEditorInstance = editorInstance;

// Initialize section and image editors for admins
if (editorInstance.isAdmin) {
    // Classes are defined above, so this is safe if isAdmin is true
    editorInstance.sectionEditor = new SectionEditor(editorInstance);
    editorInstance.imageEditor = new ImageEditor(editorInstance);
}

