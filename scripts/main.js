document.addEventListener('DOMContentLoaded', () => {
    // Inject Profile Modal CSS
    if (!document.querySelector('link[href*="profile-modal.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/styles/profile-modal.css';
        document.head.appendChild(link);
    }
    // === SEARCH FUNCTIONALITY ===
    // === SEARCH FUNCTIONALITY ===
    const searchInput = document.querySelector('.nav-search input');
    const searchContainer = document.querySelector('.nav-search');

    if (searchInput && searchContainer) {
        // Create results container
        const resultsBox = document.createElement('div');
        resultsBox.className = 'search-results';
        Object.assign(resultsBox.style, {
            position: 'absolute',
            top: '100%',
            left: '0',
            right: '0',
            background: 'rgba(15, 20, 25, 0.98)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '12px',
            marginTop: '8px',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: '1000',
            display: 'none',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
        });
        searchContainer.style.position = 'relative';
        searchContainer.appendChild(resultsBox);

        // Debounce Utility
        const debounce = (func, wait) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        };

        // State for keyboard nav
        let currentSelectionIndex = -1;
        let currentResults = [];

        const performSearch = async (query) => {
            if (query.length < 2) {
                resultsBox.style.display = 'none';
                currentResults = [];
                return;
            }

            try {
                // Show loading state if needed
                resultsBox.innerHTML = '<div style="padding:1rem; color:#6e7a8a; text-align:center;">Searching...</div>';
                resultsBox.style.display = 'block';

                const res = await (window.rtocFetch ? window.rtocFetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`) : fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`));
                const data = await res.json();

                if (data.status === 'success') {
                    currentResults = data.results;
                    renderResults(data.results, query);
                }
            } catch (e) {
                console.error("Search failed", e);
                resultsBox.innerHTML = '<div style="padding:1rem; color:#ef4444; text-align:center;">Search failed</div>';
            }
        };

        const renderResults = (results, query) => {
            resultsBox.innerHTML = '';
            currentSelectionIndex = -1;

            if (results.length === 0) {
                resultsBox.innerHTML = '<div style="padding:1rem; color:#6e7a8a; text-align:center;">No results found</div>';
                return;
            }

            const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

            results.forEach((result, index) => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.dataset.index = index;

                // Highlight logic for Snippet
                let snippetHtml = result.snippet || "";
                terms.forEach(term => {
                    const regex = new RegExp(`(${term})`, 'gi');
                    snippetHtml = snippetHtml.replace(regex, '<span class="search-highlight">$1</span>');
                });

                Object.assign(div.style, {
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    transition: 'all 0.2s'
                });

                div.innerHTML = `
                    <div style="font-weight:600; color:#fff; margin-bottom:4px; font-family: var(--font-display);">${result.name}</div>
                    <div class="search-snippet" style="font-size:0.8rem; color:#94a3b8; line-height:1.4;">${snippetHtml}</div>
                `;

                div.addEventListener('mouseenter', () => {
                    currentSelectionIndex = index;
                    updateSelection();
                });

                div.addEventListener('click', () => {
                    window.location.href = '/' + result.path;
                });

                resultsBox.appendChild(div);
            });
            resultsBox.style.display = 'block';
        };

        const updateSelection = () => {
            const items = resultsBox.querySelectorAll('.search-result-item');
            items.forEach((item, idx) => {
                if (idx === currentSelectionIndex) {
                    item.style.background = 'rgba(139, 92, 246, 0.15)';
                    item.style.borderLeft = '3px solid #1d9bf0';
                } else {
                    item.style.background = 'transparent';
                    item.style.borderLeft = '3px solid transparent';
                }
            });
        };

        // Event Listeners
        searchInput.addEventListener('input', debounce((e) => {
            performSearch(e.target.value.trim());
        }, 300)); // 300ms debounce

        searchInput.addEventListener('keydown', (e) => {
            if (resultsBox.style.display === 'none') return;

            const items = resultsBox.querySelectorAll('.search-result-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentSelectionIndex++;
                if (currentSelectionIndex >= items.length) currentSelectionIndex = 0;
                updateSelection();
                // Scroll into view if needed
                items[currentSelectionIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentSelectionIndex--;
                if (currentSelectionIndex < 0) currentSelectionIndex = items.length - 1;
                updateSelection();
                items[currentSelectionIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentSelectionIndex >= 0 && currentSelectionIndex < currentResults.length) {
                    window.location.href = '/' + currentResults[currentSelectionIndex].path;
                }
            } else if (e.key === 'Escape') {
                resultsBox.style.display = 'none';
                searchInput.blur();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchContainer.contains(e.target)) {
                resultsBox.style.display = 'none';
            }
        });

        // Focus handler just to reshow if query exists
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length >= 2 && currentResults.length > 0) {
                resultsBox.style.display = 'block';
            }
        });
    }

    // === Mobile Nav Toggle ===
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // === SCROLL EFFECT ===
    const nav = document.querySelector('.nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                nav.style.background = 'rgba(15, 20, 25, 0.98)';
                nav.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
            } else {
                nav.style.background = 'rgba(15, 20, 25, 0.95)';
                nav.style.boxShadow = 'none';
            }
        });

        // Auto-detect active link
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            // Handle Home specifically
            if (currentPath === '/' || currentPath === '/index.html' || currentPath === '') {
                if (href === '/' || href === 'index.html' || href === '/index.html' || href === '../index.html') {
                    link.classList.add('active');
                }
            } else {
                // For other pages, check if path ends with href or if href is in path
                // Normalize href (remove ../)
                const normalizedHref = href.replace(/^(\.\.\/)+/, '');
                if (currentPath.includes(normalizedHref) && normalizedHref !== '') {
                    link.classList.add('active');
                }
            }
        });
    }

    // === FORCE RESET (User Request) ===
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'true' || urlParams.get('logout') === 'true') {
        localStorage.removeItem('rtoc_user');
        localStorage.removeItem('rtoc_session');
        console.log("System Reset Performed.");
        window.location.href = window.location.pathname; // Clear query param
    }

    // === DEBUG CLICKS ===
    document.addEventListener('click', (e) => {
        console.log('Click detected on:', e.target);
    });

    // === Fade In Animation ===
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.character-card, .concept-card, .plot-section, .animate-on-scroll').forEach(el => {
        observer.observe(el);
    });

    // === AUTH / LOGIN UI ===
    const loginBtn = document.querySelector('.login-btn');
    const modalOverlay = document.querySelector('.modal-overlay');

    // 1. Process Login Callback
    // urlParams is already defined at top of scope
    const userDataB64 = urlParams.get('user_data');
    if (userDataB64) {
        try {
            const userData = JSON.parse(atob(userDataB64));
            localStorage.setItem('rtoc_user', JSON.stringify(userData));

            const sessionId = urlParams.get('session_id');
            if (sessionId) {
                localStorage.setItem('rtoc_session', sessionId);
            }

            // Dispatch event for other scripts (like editor.js)
            window.dispatchEvent(new CustomEvent('RToCUserUpdated', { detail: userData }));

            window.history.replaceState({}, document.title, window.location.pathname);

            // Re-initialize editor immediately if present
            if (window.WikiEditorInstance) {
                window.WikiEditorInstance.reinit();
            }

            // Reload to ensure all components pick up the new state cleanly
            setTimeout(() => window.location.reload(), 500);
            return;
        } catch (e) {
            console.error("Login Error", e);
        }
    }

    // 2. Render Login State - Use SERVER SESSION first, then localStorage fallback
    window.currentUser = null; // Global

    // Server-side session check (most reliable)
    (async () => {
        try {
            const res = await (window.rtocFetch ? window.rtocFetch('/api/user/me') : fetch('/api/user/me'));
            const data = await res.json();

            if (data.status === 'success' && data.user) {
                console.log('[Auth] Server session valid:', data.user.username, 'Role:', data.user.role);
                window.currentUser = data.user;
                localStorage.setItem('rtoc_user', JSON.stringify(data.user));
                renderUserProfile(data.user);

                // Notify editor
                window.dispatchEvent(new CustomEvent('RToCUserUpdated', { detail: data.user }));
                return;
            }
        } catch (e) {
            console.log('[Auth] Server session check failed, using localStorage');
        }

        // Fallback to localStorage
        const storedUser = localStorage.getItem('rtoc_user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                window.currentUser = user;
                renderUserProfile(user);

                // Still try to sync permissions
                try {
                    const permRes = await (window.rtocFetch ? window.rtocFetch('/api/permissions') : fetch('/api/permissions'));
                    const permData = await permRes.json();
                    if (permData.status === 'success' && permData.permissions) {
                        const permsLower = {};
                        Object.keys(permData.permissions).forEach(k => permsLower[k.toLowerCase()] = permData.permissions[k]);
                        const assignedRole = permData.permissions[user.id] || permsLower[user.username.toLowerCase()];

                        if (assignedRole && user.role !== assignedRole) {
                            console.log(`[Auth] Upgrading role: ${user.role} -> ${assignedRole}`);
                            user.role = assignedRole;
                            localStorage.setItem('rtoc_user', JSON.stringify(user));
                            window.currentUser = user;
                            window.dispatchEvent(new CustomEvent('RToCUserUpdated', { detail: user }));
                            renderUserProfile(user);
                        }
                    }
                } catch (e) { /* ignore */ }
            } catch (e) {
                console.log("Invalid user", e);
                localStorage.removeItem('rtoc_user');
                localStorage.removeItem('rtoc_session');
            }
        }
    })();

    function renderUserProfile(user) {
        if (!loginBtn) return;

        loginBtn.classList.add('user-profile-btn');
        loginBtn.innerHTML = `
            <div class="user-avatar-container">
                <img src="${user.avatar || 'assets/default_avatar.png'}" class="user-avatar-sm" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            </div>
            <span class="user-name">${user.username}</span>
        `;

        // DIRECT click listener - most reliable approach
        loginBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/pages/account.html';
        };

        console.log("User Loaded:", user.username, "Role:", user.role);
    }

    // === GLOBAL PROFILE CLICK DELEGATION ===
    // This ensures it works even if the element is replaced or cloned
    document.addEventListener('click', (e) => {
        const profileBtn = e.target.closest('.user-profile-btn');
        if (profileBtn) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/pages/account.html';
        }
    });

    // Clean up old modal if it exists
    const oldModal = document.getElementById('userProfileModal');
    if (oldModal) oldModal.remove();

    // showProfileModal deprecated in favor of /pages/account.html



    // Default Login Button Handler (if not logged in)
    if (loginBtn && !localStorage.getItem('rtoc_user')) {
        loginBtn.addEventListener('click', () => {
            if (modalOverlay) {
                modalOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    }

    // Modal Close Logic
    const modalClose = document.querySelector('.modal-close');
    if (modalClose && modalOverlay) {
        modalClose.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // === DISCORD LOGIN ===
    const discordLoginBtn = document.querySelector('.social-btn.discord');
    if (discordLoginBtn) {
        discordLoginBtn.addEventListener('click', () => {
            const apiBase = window.RTOC_API_BASE || '';
            window.location.href = `${apiBase}/auth/discord/login`;
        });
    }

    // === GLOBAL SPOILER HANDLER ===
    document.addEventListener('click', (e) => {
        const spoiler = e.target.closest('.spoiler');
        if (spoiler && !document.body.classList.contains('is-editing')) {
            // Check if it's already revealed to prevent double toggle if nested (though we fixed HTML)
            // Ideally we only toggle if the click wasn't on a child spoiler that handled it
            // But simple toggle works if structure is flat.

            // If we have nested spoilers (rare now), stop prop
            e.stopPropagation();
            spoiler.classList.toggle('revealed');
        }
    });

    // === GLOBAL CAROUSEL DELEGATION ===
    document.addEventListener('click', (e) => {
        // Buttons
        const btn = e.target.closest('.carousel-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            handleCarouselAction(btn.closest('.carousel-container'), btn.classList.contains('prev') ? 'prev' : 'next');
            return;
        }

        // Dots
        const dot = e.target.closest('.dot');
        if (dot) {
            e.preventDefault();
            e.stopPropagation();
            handleCarouselAction(dot.closest('.carousel-container'), parseInt(dot.dataset.index));
        }
    });

    function handleCarouselAction(container, action) {
        if (!container) return;

        const images = container.querySelectorAll('.carousel-img');
        const dots = container.querySelectorAll('.dot');
        let caption = container.nextElementSibling;

        // Fallback for caption
        if (!caption || caption.id !== 'carousel-caption') {
            caption = document.getElementById('carousel-caption');
        }

        let currentIndex = 0;
        images.forEach((img, i) => {
            if (img.classList.contains('active')) currentIndex = i;
        });

        let newIndex = currentIndex;
        if (action === 'prev') newIndex--;
        if (action === 'next') newIndex++;
        if (typeof action === 'number') newIndex = action;

        // Wrap
        if (newIndex < 0) newIndex = images.length - 1;
        if (newIndex >= images.length) newIndex = 0;

        // Toggle
        images.forEach((img, i) => img.classList.toggle('active', i === newIndex));
        dots.forEach((dot, i) => dot.classList.toggle('active', i === newIndex));

        // Update Caption
        if (caption && images[newIndex].dataset.caption) {
            caption.textContent = images[newIndex].dataset.caption;
            caption.style.opacity = '0';
            requestAnimationFrame(() => {
                caption.style.transition = 'opacity 0.3s';
                caption.style.opacity = '1';
            });
        }
    }
});
