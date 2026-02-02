import { useEffect, useRef, useCallback, useState } from 'react';

const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const WARNING_TIMEOUT = 19 * 60 * 1000;    // 19 minutes

export const useSessionTimeout = (token, onLogout, addToast) => {
    const [showWarning, setShowWarning] = useState(false);
    const timeoutRef = useRef(null);
    const warningTimeoutRef = useRef(null);
    const lastActivityRef = useRef(Date.now());

    const resetTimer = useCallback(() => {
        lastActivityRef.current = Date.now();

        // Clear existing timers
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);

        // Hide warning if shown
        setShowWarning(false);

        // Set warning timer (19 minutes)
        warningTimeoutRef.current = setTimeout(() => {
            setShowWarning(true);
            addToast?.('Your session will expire in 1 minute due to inactivity', 'warning');
        }, WARNING_TIMEOUT);

        // Set logout timer (20 minutes)
        timeoutRef.current = setTimeout(() => {
            addToast?.('Session expired due to inactivity', 'error');
            onLogout();
        }, INACTIVITY_TIMEOUT);
    }, [onLogout, addToast]);

    const handleActivity = useCallback(() => {
        // Debounce activity tracking (only reset if > 1 second since last activity)
        if (Date.now() - lastActivityRef.current > 1000) {
            resetTimer();
        }
    }, [resetTimer]);

    const handleStayLoggedIn = useCallback(() => {
        setShowWarning(false);
        resetTimer();
        addToast?.('Session extended', 'success');
    }, [resetTimer, addToast]);

    useEffect(() => {
        if (!token) {
            // Clear timers if logged out
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
            setShowWarning(false);
            return;
        }

        // Initialize timers
        resetTimer();

        // Activity event listeners
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Cleanup
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
            events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [token, handleActivity, resetTimer]);

    return { showWarning, handleStayLoggedIn };
};
