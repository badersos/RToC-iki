// API Configuration for RToC Wiki
// This file configures the API endpoint for the wiki

(function () {
    // Detect if we're on GitHub Pages or local development
    const isGitHubPages = window.location.hostname.includes('github.io');
    const isCustomDomain = window.location.hostname.includes('regressorstaleofcultivation.space');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Set API base URL based on environment
    let API_BASE = '';

    if (isLocalhost) {
        // Local development - use same origin
        API_BASE = '';
    } else if (isGitHubPages || isCustomDomain) {
        // GitHub Pages or custom domain - point to the primary domain
        API_BASE = 'https://regressorstaleofcultivation.space';
    } else {
        // Fallback - assume server running on same origin (e.g., Cloudflare tunnel)
        API_BASE = '';
    }

    // Expose globally
    window.RTOC_API_BASE = API_BASE;

    // Helper function for API calls
    window.rtocFetch = function (endpoint, options = {}) {
        const url = API_BASE + endpoint;

        // ALWAYS include credentials for both same-origin and cross-origin
        options.credentials = 'include';

        // Add session token as Authorization header (cross-origin cookie fix)
        const sessionToken = localStorage.getItem('rtoc_session');
        if (sessionToken) {
            if (!options.headers) options.headers = {};
            // Preserve existing Content-Type if set, but add Authorization
            if (options.headers instanceof Headers) {
                options.headers.set('Authorization', 'Bearer ' + sessionToken);
            } else {
                options.headers['Authorization'] = 'Bearer ' + sessionToken;
            }
        }

        console.log('[rtocFetch] Request:', endpoint, 'Options:', options);
        return fetch(url, options);
    };

    // Wake-up helper for Render free tier (cold starts take 30-60s)
    window.rtocWakeServer = async function () {
        if (!API_BASE) return true; // Same origin, no cold start issue
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);
            const res = await fetch(API_BASE + '/api/health', { signal: controller.signal });
            clearTimeout(timeout);
            return res.ok;
        } catch (e) {
            console.log('[RToC] Server wake-up failed:', e.message);
            return false;
        }
    };

    console.log('[RToC] API Base URL:', API_BASE || '(same origin)');
})();
