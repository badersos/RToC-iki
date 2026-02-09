// API Configuration for RToC Wiki
// This file configures the API endpoint for the wiki

(function () {
    // Detect if we're on GitHub Pages or local development
    const isGitHubPages = window.location.hostname.includes('github.io');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Set API base URL based on environment
    // UPDATE THIS after deploying to Render.com with your actual URL
    let API_BASE = '';

    if (isLocalhost) {
        // Local development - use same origin
        API_BASE = '';
    } else if (isGitHubPages) {
        // GitHub Pages - point to Render.com deployed server
        // IMPORTANT: Replace this URL after deploying to Render.com!
        API_BASE = 'https://rtoc-wiki-api.onrender.com';
    } else {
        // Custom domain with server running (e.g., Cloudflare tunnel)
        API_BASE = '';
    }

    // Expose globally
    window.RTOC_API_BASE = API_BASE;

    // Helper function for API calls
    window.rtocFetch = function (endpoint, options = {}) {
        const url = API_BASE + endpoint;

        // Add credentials for cross-origin requests
        if (API_BASE) {
            options.credentials = 'include';
        }

        return fetch(url, options);
    };

    console.log('[RToC] API Base URL:', API_BASE || '(same origin)');
})();
