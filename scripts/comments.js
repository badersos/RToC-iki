/* comments.js - Complete Comment System with Replies, Voting, Editing */

// Self-contained API configuration (in case api-config.js isn't loaded)
(function () {
    if (typeof window.RTOC_API_BASE === 'undefined') {
        const isCustomDomain = window.location.hostname.includes('regressorstaleofcultivation.space');
        const isGitHubPages = window.location.hostname.includes('github.io');
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            window.RTOC_API_BASE = '';
        } else if (isCustomDomain || isGitHubPages) {
            window.RTOC_API_BASE = 'https://rtoc-iki.onrender.com';
        } else {
            window.RTOC_API_BASE = '';
        }
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('comments-section');
    if (!container) return;

    // Use pathname, ensuring no trailing slash unless it's just '/'
    let pageId = window.location.pathname;
    if (pageId.length > 1 && pageId.endsWith('/')) {
        pageId = pageId.slice(0, -1);
    }
    console.log('[Comments] Initializing for pageId:', pageId);
    window.CommentSystem = new CommentSystem(container, pageId);
});

class CommentSystem {
    constructor(container, pageId) {
        this.container = container;
        this.pageId = pageId;
        this.user = JSON.parse(localStorage.getItem('rtoc_user') || 'null');
        this.sortBy = 'newest';
        this.replyingTo = null;
        this.editingId = null;

        this.init();
    }

    init() {
        this.injectStyles();
        this.renderLayout();
        this.loadComments();
        this.attachEventListeners();
    }

    get isLoggedIn() {
        return !!this.user;
    }

    get isAdmin() {
        return this.user && (this.user.role === 'admin' || this.user.role === 'owner');
    }

    get userId() {
        return this.user?.id || this.user?.username || 'anonymous';
    }

    // API helper for cross-origin requests
    apiUrl(endpoint) {
        return (window.RTOC_API_BASE || '') + endpoint;
    }

    async apiFetch(endpoint, options = {}) {
        if (window.rtocFetch) {
            return window.rtocFetch(endpoint, options);
        }

        const url = this.apiUrl(endpoint);
        if (window.RTOC_API_BASE) {
            options.credentials = 'include';
        }
        return fetch(url, options);
    }

    injectStyles() {
        if (document.getElementById('comment-styles-v2')) return;

        const style = document.createElement('style');
        style.id = 'comment-styles-v2';
        style.textContent = `
            .comments-wrapper {
                margin-top: 60px;
                padding-top: 30px;
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            .comments-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
                gap: 15px;
            }
            .comments-title {
                font-size: 1.2rem;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
            }
            .comments-title span {
                color: #888;
                font-size: 1rem;
            }
            .sort-controls {
                display: flex;
                gap: 8px;
            }
            .sort-btn {
                padding: 6px 12px;
                background: transparent;
                border: 1px solid rgba(255,255,255,0.15);
                color: #888;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                transition: all 0.2s;
            }
            .sort-btn:hover {
                border-color: rgba(139, 92, 246, 0.5);
                color: #aaa;
            }
            .sort-btn.active {
                background: rgba(139, 92, 246, 0.2);
                border-color: #8B5CF6;
                color: #8B5CF6;
            }

            /* Comment Input */
            .comment-input-area {
                display: flex;
                gap: 15px;
                margin-bottom: 30px;
                background: rgba(255,255,255,0.03);
                padding: 20px;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.05);
                align-items: flex-start;
            }
            .comment-input-area.replying {
                border-color: rgba(139, 92, 246, 0.3);
                background: rgba(139, 92, 246, 0.05);
            }
            .reply-indicator {
                display: none;
                align-items: center;
                gap: 8px;
                font-size: 0.85rem;
                color: #8B5CF6;
                margin-bottom: 10px;
            }
            .reply-indicator.active {
                display: flex;
            }
            .cancel-reply {
                background: none;
                border: none;
                color: #888;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .cancel-reply:hover {
                background: rgba(255,255,255,0.1);
            }

            .user-badge, .comment-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, #8B5CF6, #6D28D9);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                flex-shrink: 0;
                overflow: hidden;
            }
            .user-avatar-img, .comment-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .input-wrapper {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .comment-input-area textarea {
                width: 100%;
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                color: white;
                resize: none;
                font-family: inherit;
                padding: 12px;
                outline: none;
                min-height: 60px;
                transition: border-color 0.2s;
            }
            .comment-input-area textarea:focus {
                border-color: rgba(139, 92, 246, 0.5);
            }
            .input-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            .post-btn {
                background: linear-gradient(135deg, #8B5CF6, #6D28D9);
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
            }
            .post-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
            }
            .post-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }

            /* Comments List */
            .comments-list {
                display: flex;
                flex-direction: column;
                gap: 0;
            }

            /* Comment Item */
            .comment-item {
                display: flex;
                gap: 15px;
                padding: 20px 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                animation: fadeIn 0.3s ease;
            }
            .comment-item:last-child {
                border-bottom: none;
            }
            .comment-item.pinned {
                background: rgba(255, 215, 0, 0.05);
                border-left: 3px solid #FFD700;
                padding-left: 15px;
                margin-left: -15px;
                border-radius: 0 8px 8px 0;
            }
            .comment-item.deleted {
                opacity: 0.5;
            }
            .comment-item.deleted .comment-text {
                font-style: italic;
                color: #666;
            }

            /* Nested Replies */
            .comment-replies {
                margin-left: 55px;
                border-left: 2px solid rgba(139, 92, 246, 0.2);
                padding-left: 20px;
            }
            .comment-replies .comment-item {
                padding: 15px 0;
            }
            .comment-replies .comment-avatar {
                width: 32px;
                height: 32px;
                font-size: 0.8rem;
            }

            /* Voting */
            .vote-section {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                margin-right: 5px;
            }
            .vote-btn {
                background: none;
                border: none;
                color: #555;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s;
                font-size: 1.2rem;
            }
            .vote-btn:hover {
                background: rgba(255,255,255,0.1);
            }
            .vote-btn.upvoted {
                color: #10B981;
            }
            .vote-btn.downvoted {
                color: #EF4444;
            }
            .vote-score {
                font-size: 0.9rem;
                font-weight: 600;
                color: #888;
                min-width: 20px;
                text-align: center;
            }
            .vote-score.positive {
                color: #10B981;
            }
            .vote-score.negative {
                color: #EF4444;
            }

            /* Comment Content */
            .comment-body {
                flex: 1;
                min-width: 0;
            }
            .comment-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .comment-author {
                font-weight: 600;
                color: #fff;
            }
            .role-tag {
                font-size: 0.7rem;
                padding: 2px 8px;
                border-radius: 10px;
                text-transform: uppercase;
                font-weight: bold;
            }
            .role-tag.owner { background: rgba(255, 215, 0, 0.2); color: #FFD700; }
            .role-tag.admin { background: rgba(255, 75, 75, 0.2); color: #FF4B4B; }
            .pin-badge {
                font-size: 0.7rem;
                padding: 2px 8px;
                border-radius: 10px;
                background: rgba(255, 215, 0, 0.15);
                color: #FFD700;
            }
            .edited-badge {
                font-size: 0.75rem;
                color: #666;
                font-style: italic;
            }
            .comment-time {
                font-size: 0.8rem;
                color: #666;
            }
            .comment-text {
                color: #ccc;
                line-height: 1.6;
                white-space: pre-wrap;
                word-break: break-word;
            }

            /* Comment Actions */
            .comment-actions {
                display: flex;
                gap: 15px;
                margin-top: 10px;
            }
            .action-btn {
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                font-size: 0.8rem;
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .action-btn:hover {
                background: rgba(255,255,255,0.05);
                color: #8B5CF6;
            }
            .action-btn.delete:hover {
                color: #EF4444;
            }

            /* Edit Mode */
            .edit-textarea {
                width: 100%;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 8px;
                color: white;
                padding: 10px;
                font-family: inherit;
                resize: vertical;
                min-height: 80px;
                margin-bottom: 10px;
            }
            .edit-actions {
                display: flex;
                gap: 10px;
            }
            .edit-actions button {
                padding: 6px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                transition: all 0.2s;
            }
            .save-edit-btn {
                background: #8B5CF6;
                border: none;
                color: white;
            }
            .cancel-edit-btn {
                background: transparent;
                border: 1px solid rgba(255,255,255,0.2);
                color: #aaa;
            }

            /* Login Prompt */
            .comment-login-prompt {
                text-align: center;
                padding: 40px;
                background: rgba(255,255,255,0.02);
                border-radius: 12px;
                color: #888;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }
            .comment-login-prompt ion-icon { 
                font-size: 3rem; 
                opacity: 0.4; 
            }
            .comment-login-prompt a { 
                color: #8B5CF6; 
                text-decoration: none; 
                font-weight: bold; 
            }

            /* Loading & Empty States */
            .loading-comments, .empty-comments {
                text-align: center;
                color: #666;
                padding: 40px;
            }
            .loading-comments {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            .loading-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(139, 92, 246, 0.3);
                border-top-color: #8B5CF6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Mobile Responsive */
            @media (max-width: 600px) {
                .comment-input-area {
                    flex-direction: column;
                }
                .comment-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 5px;
                }
                .comment-replies {
                    margin-left: 20px;
                    padding-left: 15px;
                }
                .vote-section {
                    flex-direction: row;
                }
            }
        `;
        document.head.appendChild(style);
    }

    renderLayout() {
        let avatarHtml = '';
        if (this.isLoggedIn) {
            if (this.user.avatar) {
                avatarHtml = `<img src="${this.user.avatar}" class="user-avatar-img" onerror="this.parentElement.innerHTML='${this.user.username.charAt(0).toUpperCase()}'">`;
            } else {
                avatarHtml = this.user.username.charAt(0).toUpperCase();
            }
        }

        const inputSection = this.isLoggedIn ? `
            <div class="comment-input-area" id="mainInputArea">
                <div class="user-badge">${avatarHtml}</div>
                <div class="input-wrapper">
                    <div class="reply-indicator" id="replyIndicator">
                        <ion-icon name="return-down-forward-outline"></ion-icon>
                        <span>Replying to <strong id="replyingToName"></strong></span>
                        <button class="cancel-reply" onclick="CommentSystem.cancelReply()">✕</button>
                    </div>
                    <textarea id="commentInput" placeholder="Share your thoughts..." rows="2"></textarea>
                    <div class="input-actions">
                        <button class="post-btn" id="postCommentBtn">
                            <ion-icon name="send-outline"></ion-icon> Post
                        </button>
                    </div>
                </div>
            </div>
        ` : `
            <div class="comment-login-prompt">
                <ion-icon name="chatbubbles-outline"></ion-icon>
                <p>Join the discussion!</p>
                <span>Please <a href="#" onclick="mockLogin(); return false;">login</a> to post comments.</span>
            </div>
        `;

        this.container.innerHTML = `
            <div class="comments-wrapper">
                <div class="comments-header">
                    <h3 class="comments-title">
                        <ion-icon name="chatbubbles-outline"></ion-icon>
                        Discussion <span id="commentCount">(0)</span>
                    </h3>
                    <div class="sort-controls">
                        <button class="sort-btn active" data-sort="newest">Newest</button>
                        <button class="sort-btn" data-sort="oldest">Oldest</button>
                        <button class="sort-btn" data-sort="top">Top</button>
                    </div>
                </div>
                
                ${inputSection}

                <div id="commentsList" class="comments-list">
                    <div class="loading-comments">
                        <div class="loading-spinner"></div>
                        <span>Loading discussion...</span>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Post button
        document.getElementById('postCommentBtn')?.addEventListener('click', () => this.postComment());

        // Enter to post (Ctrl+Enter)
        document.getElementById('commentInput')?.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.postComment();
            }
        });

        // Sort buttons
        this.container.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sortBy = btn.dataset.sort;
                this.loadComments();
            });
        });

        // Auto-resize textarea
        const textarea = document.getElementById('commentInput');
        if (textarea) {
            textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });
        }
    }

    async loadComments() {
        const list = document.getElementById('commentsList');
        list.innerHTML = `<div class="loading-comments"><div class="loading-spinner"></div><span>Loading...</span></div>`;

        try {
            const res = await this.apiFetch(`/api/comments?pageId=${encodeURIComponent(this.pageId)}&sort=${this.sortBy}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();

            if (data.status === 'success') {
                document.getElementById('commentCount').textContent = `(${data.total || data.comments.length})`;

                if (data.comments.length === 0) {
                    list.innerHTML = `<div class="empty-comments">No comments yet. Be the first to share your thoughts!</div>`;
                    return;
                }

                // Organize into threads
                const threads = this.organizeThreads(data.comments);
                list.innerHTML = threads.map(c => this.renderComment(c)).join('');
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (e) {
            console.error("Comment load error:", e);
            list.innerHTML = `<div class="empty-comments" style="color:#EF4444;">Failed to load comments: ${e.message}</div>`;
        }
    }

    organizeThreads(comments) {
        // Separate top-level and replies
        const topLevel = comments.filter(c => !c.parent_id);
        const replies = comments.filter(c => c.parent_id);

        // Attach replies to parents
        topLevel.forEach(parent => {
            parent.replies = replies.filter(r => r.parent_id === parent.id);
        });

        return topLevel;
    }

    renderComment(comment, isReply = false) {
        // Robustness checks for migrated/legacy data
        const safeLikes = Array.isArray(comment.likes) ? comment.likes : [];
        const safeDislikes = Array.isArray(comment.dislikes) ? comment.dislikes : [];

        const score = safeLikes.length - safeDislikes.length;
        const userVote = safeLikes.includes(this.userId) ? 'like' :
            (safeDislikes.includes(this.userId) ? 'dislike' : null);

        const isOwn = this.user && (comment.user === this.user.username || comment.user_id === this.userId);
        const canModify = isOwn || this.isAdmin;
        const isDeleted = comment.is_deleted || false;
        const isPinned = comment.is_pinned || false;

        let avatarContent = comment.user?.charAt(0).toUpperCase() || '?';
        if (comment.avatar) {
            avatarContent = `<img src="${comment.avatar}" onerror="this.parentElement.innerHTML='${avatarContent}'">`;
        }

        // Link wrapper for avatar
        const avatarLink = `<a href="/pages/account.html?username=${encodeURIComponent(comment.user || 'Anonymous')}" style="text-decoration:none; color:inherit; display:flex;">${avatarContent}</a>`;

        const roleClass = comment.role ? `role-${comment.role}` : '';
        const roleTag = comment.role && comment.role !== 'user'
            ? `<span class="role-tag ${comment.role}">${comment.role}</span>` : '';
        const pinBadge = isPinned ? `<span class="pin-badge">📌 Pinned</span>` : '';
        const editedBadge = comment.updated_at ? `<span class="edited-badge">(edited)</span>` : '';

        const actions = !isDeleted ? `
            <div class="comment-actions">
                ${this.isLoggedIn && !isReply ? `<button class="action-btn" onclick="CommentSystem.reply('${comment.id}', '${comment.user}')"><ion-icon name="return-down-forward-outline"></ion-icon> Reply</button>` : ''}
                ${canModify ? `<button class="action-btn" onclick="CommentSystem.edit('${comment.id}')"><ion-icon name="create-outline"></ion-icon> Edit</button>` : ''}
                ${canModify ? `<button class="action-btn delete" onclick="CommentSystem.delete('${comment.id}')"><ion-icon name="trash-outline"></ion-icon> Delete</button>` : ''}
                ${this.isAdmin ? `<button class="action-btn" onclick="CommentSystem.pin('${comment.id}')">${isPinned ? '📌 Unpin' : '📌 Pin'}</button>` : ''}
            </div>
        ` : '';

        const repliesHtml = comment.replies?.length > 0
            ? `<div class="comment-replies">${comment.replies.map(r => this.renderComment(r, true)).join('')}</div>`
            : '';

        return `
            <div class="comment-item ${isPinned ? 'pinned' : ''} ${isDeleted ? 'deleted' : ''}" data-id="${comment.id}">
                <div class="vote-section">
                    <button class="vote-btn ${userVote === 'like' ? 'upvoted' : ''}" onclick="CommentSystem.vote('${comment.id}', 'like')" ${!this.isLoggedIn ? 'disabled' : ''}>
                        <ion-icon name="chevron-up-outline"></ion-icon>
                    </button>
                    <span class="vote-score ${score > 0 ? 'positive' : (score < 0 ? 'negative' : '')}">${score}</span>
                    <button class="vote-btn ${userVote === 'dislike' ? 'downvoted' : ''}" onclick="CommentSystem.vote('${comment.id}', 'dislike')" ${!this.isLoggedIn ? 'disabled' : ''}>
                        <ion-icon name="chevron-down-outline"></ion-icon>
                    </button>
                </div>
                <div class="comment-avatar ${roleClass}">${avatarLink}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <a href="/pages/account.html?username=${encodeURIComponent(comment.user)}" class="comment-author" style="text-decoration:none;">${this.escapeHtml(comment.user)}</a>
                        ${roleTag}
                        ${pinBadge}
                        <span class="comment-time">${this.timeAgo(comment.created_at || comment.timestamp)}</span>
                        ${editedBadge}
                    </div>
                    <div class="comment-text" id="text-${comment.id}">${this.escapeHtml(comment.content)}</div>
                    ${actions}
                </div>
            </div>
            ${repliesHtml}
        `;
    }

    async postComment() {
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content) return;

        const btn = document.getElementById('postCommentBtn');
        btn.disabled = true;
        btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Posting...';

        try {
            const payload = {
                pageId: this.pageId,
                user: this.user.username,
                user_id: this.userId,
                role: this.user.role,
                avatar: this.user.avatar,
                content: content,
                parent_id: this.replyingTo
            };

            const res = await this.apiFetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                input.value = '';
                input.style.height = 'auto';
                this.cancelReplyState();
                this.loadComments();
            } else {
                throw new Error(data.message || 'Failed to post');
            }
        } catch (e) {
            console.error("Post error:", e);
            alert('Failed to post: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<ion-icon name="send-outline"></ion-icon> Post';
        }
    }

    // Static methods for onclick handlers
    static reply(commentId, username) {
        window.CommentSystem.setReply(commentId, username);
    }

    static cancelReply() {
        window.CommentSystem.cancelReplyState();
    }

    static async vote(commentId, voteType) {
        await window.CommentSystem.voteComment(commentId, voteType);
    }

    static async edit(commentId) {
        window.CommentSystem.editComment(commentId);
    }

    static async delete(commentId) {
        await window.CommentSystem.deleteComment(commentId);
    }

    static async pin(commentId) {
        await window.CommentSystem.pinComment(commentId);
    }

    setReply(commentId, username) {
        this.replyingTo = commentId;
        document.getElementById('replyIndicator').classList.add('active');
        document.getElementById('replyingToName').textContent = username;
        document.getElementById('mainInputArea').classList.add('replying');
        document.getElementById('commentInput').focus();
        document.getElementById('commentInput').placeholder = `Replying to ${username}...`;
    }

    cancelReplyState() {
        this.replyingTo = null;
        document.getElementById('replyIndicator')?.classList.remove('active');
        document.getElementById('mainInputArea')?.classList.remove('replying');
        const input = document.getElementById('commentInput');
        if (input) input.placeholder = 'Share your thoughts...';
    }

    async voteComment(commentId, voteType) {
        if (!this.isLoggedIn) return;

        try {
            const res = await this.apiFetch('/api/comments/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: this.pageId,
                    commentId: commentId,
                    userId: this.userId,
                    voteType: voteType
                })
            });

            if (res.ok) {
                this.loadComments(); // Refresh to show updated votes
            }
        } catch (e) {
            console.error("Vote error:", e);
        }
    }

    editComment(commentId) {
        const textEl = document.getElementById(`text-${commentId}`);
        if (!textEl) return;

        const currentText = textEl.textContent;
        textEl.innerHTML = `
            <textarea class="edit-textarea" id="edit-input-${commentId}">${this.escapeHtml(currentText)}</textarea>
            <div class="edit-actions">
                <button class="save-edit-btn" onclick="CommentSystem.saveEdit('${commentId}')">Save</button>
                <button class="cancel-edit-btn" onclick="CommentSystem.cancelEdit('${commentId}', '${this.escapeHtml(currentText).replace(/'/g, "\\'")}')">Cancel</button>
            </div>
        `;
        document.getElementById(`edit-input-${commentId}`).focus();
    }

    static async saveEdit(commentId) {
        await window.CommentSystem.saveEditComment(commentId);
    }

    static cancelEdit(commentId, originalText) {
        const textEl = document.getElementById(`text-${commentId}`);
        if (textEl) textEl.textContent = originalText;
    }

    async saveEditComment(commentId) {
        const input = document.getElementById(`edit-input-${commentId}`);
        if (!input) return;

        const newContent = input.value.trim();
        if (!newContent) return;

        try {
            const res = await this.apiFetch('/api/comments/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: this.pageId,
                    commentId: commentId,
                    userId: this.userId,
                    user: this.user.username,
                    content: newContent,
                    isAdmin: this.isAdmin
                })
            });

            if (res.ok) {
                this.loadComments();
            } else {
                const data = await res.json();
                alert('Edit failed: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error("Edit error:", e);
            alert('Edit failed: ' + e.message);
        }
    }

    async deleteComment(commentId) {
        if (!confirm('Delete this comment?')) return;

        try {
            const res = await this.apiFetch('/api/comments/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: this.pageId,
                    commentId: commentId,
                    userId: this.userId,
                    user: this.user.username,
                    isAdmin: this.isAdmin
                })
            });

            if (res.ok) {
                this.loadComments();
            }
        } catch (e) {
            console.error("Delete error:", e);
        }
    }

    async pinComment(commentId) {
        try {
            const res = await this.apiFetch('/api/comments/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: this.pageId,
                    commentId: commentId,
                    isAdmin: this.isAdmin
                })
            });

            if (res.ok) {
                this.loadComments();
            }
        } catch (e) {
            console.error("Pin error:", e);
        }
    }

    timeAgo(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;

        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'week', seconds: 604800 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 }
        ];

        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) {
                return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
            }
        }

        return seconds < 10 ? 'just now' : `${Math.floor(seconds)} seconds ago`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global login function (kept for compatibility)
function mockLogin() {
    const username = prompt("Enter your username:");
    if (!username) return;

    let role = 'user';
    if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'owner') {
        const key = prompt("Enter Admin Key:");
        if (key === 'admin') role = 'admin';
    }

    const avatar = prompt("Enter Avatar URL (optional):");

    localStorage.setItem('rtoc_user', JSON.stringify({
        username: username,
        role: role,
        avatar: avatar || null,
        id: 'local_' + Date.now()
    }));
    location.reload();
}
