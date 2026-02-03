document.addEventListener('DOMContentLoaded', () => {
    // Inject Profile Modal CSS
    if (!document.querySelector('link[href*="profile-modal.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/styles/profile-modal.css';
        document.head.appendChild(link);
    }
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
            background: 'rgba(26, 31, 46, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            marginTop: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: '1000',
            display: 'none',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        });
        searchContainer.style.position = 'relative'; // Ensure positioning context
        searchContainer.appendChild(resultsBox);

        let allPages = [];

        // Fetch pages once on focus to cache
        searchInput.addEventListener('focus', async () => {
            if (allPages.length === 0) {
                try {
                    const res = await fetch('/api/pages');
                    const data = await res.json();
                    if (data.status === 'success') {
                        allPages = data.pages;
                    }
                } catch (e) {
                    console.error("Failed to fetch pages for search", e);
                }
            }
        });

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            resultsBox.innerHTML = '';

            if (query.length < 2) {
                resultsBox.style.display = 'none';
                return;
            }

            const matches = allPages.filter(page => {
                // Simple weighting: Title match > path match
                const name = page.name.toLowerCase().replace('.html', '').replace(/_/g, ' ');
                return name.includes(query);
            }).slice(0, 10); // Limit to 10 results

            if (matches.length > 0) {
                matches.forEach(page => {
                    const div = document.createElement('div');
                    const displayName = page.name.replace('.html', '').replace(/_/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase()); // Title Case

                    Object.assign(div.style, {
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        color: '#b8c5d6',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                    });

                    div.innerHTML = `
                        <div style="font-weight:600; color:#fff;">${displayName}</div>
                        <div style="font-size:0.75rem; opacity:0.6; margin-top:2px;">${page.path}</div>
                    `;

                    div.addEventListener('mouseenter', () => div.style.background = 'rgba(139, 92, 246, 0.2)');
                    div.addEventListener('mouseleave', () => div.style.background = 'transparent');

                    div.addEventListener('click', () => {
                        window.location.href = '/' + page.path;
                    });

                    resultsBox.appendChild(div);
                });
                resultsBox.style.display = 'block';
            } else {
                resultsBox.style.display = 'none';
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchContainer.contains(e.target)) {
                resultsBox.style.display = 'none';
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
    }

    // === FORCE RESET (User Request) ===
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'true' || urlParams.get('logout') === 'true') {
        localStorage.removeItem('rtoc_user');
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
            const res = await fetch('/api/user/me');
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
                    const permRes = await fetch('/api/permissions');
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
            window.location.href = '/auth/discord/login';
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
