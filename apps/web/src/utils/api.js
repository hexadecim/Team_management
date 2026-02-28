import { API_BASE } from '../config';

const getTokens = () => ({
    accessToken: localStorage.getItem('vibe-token'),
    refreshToken: localStorage.getItem('vibe-refresh-token')
});

const setTokens = (accessToken, refreshToken) => {
    if (accessToken) localStorage.setItem('vibe-token', accessToken);
    if (refreshToken) localStorage.setItem('vibe-refresh-token', refreshToken);
};

const clearTokens = () => {
    localStorage.removeItem('vibe-token');
    localStorage.removeItem('vibe-refresh-token');
};

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
    refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token) => {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
};

export const apiFetch = async (endpoint, options = {}) => {
    const { accessToken } = getTokens();

    // Don't set Content-Type for FormData — let the browser set it automatically
    // with the correct multipart/form-data boundary.
    const isFormData = options.body instanceof FormData;

    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = {
        ...options,
        headers
    };

    let response = await fetch(`${API_BASE}${endpoint}`, config);

    // If 401 and we haven't already retried, attempt token refresh
    if (response.status === 401 && !options._retry) {
        if (isRefreshing) {
            return new Promise((resolve) => {
                subscribeTokenRefresh((token) => {
                    config.headers['Authorization'] = `Bearer ${token}`;
                    resolve(fetch(`${API_BASE}${endpoint}`, config));
                });
            });
        }

        const { refreshToken } = getTokens();
        if (!refreshToken) {
            // No refresh token available — must re-login
            return response;
        }

        isRefreshing = true;

        try {
            const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (refreshRes.ok) {
                const data = await refreshRes.json();
                setTokens(data.accessToken);
                isRefreshing = false;
                onTokenRefreshed(data.accessToken);

                // Retry original request with new token
                config.headers['Authorization'] = `Bearer ${data.accessToken}`;
                config._retry = true;
                return fetch(`${API_BASE}${endpoint}`, config);
            } else {
                // Refresh also failed — force re-login
                isRefreshing = false;
                clearTokens();
                window.location.reload();
                return response;
            }
        } catch (err) {
            isRefreshing = false;
            return response;
        }
    }

    return response;
};

export const api = {
    get: (endpoint, options) =>
        apiFetch(endpoint, { ...options, method: 'GET' }),
    post: (endpoint, body, options) =>
        apiFetch(endpoint, {
            ...options,
            method: 'POST',
            body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body))
        }),
    put: (endpoint, body, options) =>
        apiFetch(endpoint, {
            ...options,
            method: 'PUT',
            body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body))
        }),
    delete: (endpoint, options) =>
        apiFetch(endpoint, { ...options, method: 'DELETE' }),
    fetch: apiFetch
};
