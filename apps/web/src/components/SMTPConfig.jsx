/**
 * SMTP Configuration Component
 * Allows administrators to configure email notification settings
 */

import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:4001';

function SMTPConfig({ token, addToast }) {
    const [config, setConfig] = useState({
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUsername: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'Aganya Core',
        enabled: true
    });
    const [testEmail, setTestEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [hasConfig, setHasConfig] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const res = await fetch(`${API_BASE}/smtp-config`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                    setConfig({
                        ...config,
                        smtpHost: data.smtpHost || '',
                        smtpPort: data.smtpPort || 587,
                        smtpSecure: data.smtpSecure || false,
                        smtpUsername: data.smtpUsername || '',
                        fromEmail: data.fromEmail || '',
                        fromName: data.fromName || 'Aganya Core',
                        enabled: data.enabled !== undefined ? data.enabled : true
                    });
                    setHasConfig(true);
                }
            }
        } catch (error) {
            console.error('Error loading SMTP config:', error);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validation
            if (!config.smtpHost || !config.smtpUsername || !config.smtpPassword || !config.fromEmail) {
                addToast('Please fill in all required fields', 'error');
                setLoading(false);
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(config.fromEmail)) {
                addToast('Invalid email format', 'error');
                setLoading(false);
                return;
            }

            const res = await fetch(`${API_BASE}/smtp-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                addToast('SMTP configuration saved successfully', 'success');
                setHasConfig(true);
                loadConfig(); // Reload to get the saved config
            } else {
                const error = await res.json();
                addToast(error.error || 'Failed to save SMTP configuration', 'error');
            }
        } catch (error) {
            console.error('Error saving SMTP config:', error);
            addToast('Error saving SMTP configuration', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        if (!testEmail) {
            addToast('Please enter a test email address', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(testEmail)) {
            addToast('Invalid email format', 'error');
            return;
        }

        setTesting(true);

        try {
            const res = await fetch(`${API_BASE}/smtp-config/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ testEmail })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                addToast('Test email sent successfully! Check your inbox.', 'success');
            } else {
                addToast(data.error || 'Failed to send test email', 'error');
            }
        } catch (error) {
            console.error('Error sending test email:', error);
            addToast('Error sending test email', 'error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="smtp-config">
            <div className="card-header">
                <h3>📧 Email Notification Settings</h3>
                <p className="subtitle">Configure SMTP settings for sending email notifications</p>
            </div>

            <form onSubmit={handleSave} className="smtp-form">
                <div className="form-section">
                    <h4>SMTP Server Settings</h4>

                    <div className="input-group">
                        <label htmlFor="smtpHost">SMTP Host *</label>
                        <input
                            id="smtpHost"
                            type="text"
                            placeholder="smtp.gmail.com"
                            value={config.smtpHost}
                            onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                            required
                        />
                        <small>Example: smtp.gmail.com, smtp.office365.com</small>
                    </div>

                    <div className="input-row">
                        <div className="input-group">
                            <label htmlFor="smtpPort">SMTP Port *</label>
                            <input
                                id="smtpPort"
                                type="number"
                                min="1"
                                max="65535"
                                value={config.smtpPort}
                                onChange={(e) => {
                                    const port = parseInt(e.target.value);
                                    setConfig({ ...config, smtpPort: isNaN(port) ? 587 : port });
                                }}
                                required
                            />
                            <small>Common: 587 (TLS), 465 (SSL), 25</small>
                        </div>

                        <div className="input-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={config.smtpSecure}
                                    onChange={(e) => setConfig({ ...config, smtpSecure: e.target.checked })}
                                />
                                Use SSL/TLS (port 465)
                            </label>
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="smtpUsername">SMTP Username *</label>
                        <input
                            id="smtpUsername"
                            type="text"
                            placeholder="your-email@example.com"
                            value={config.smtpUsername}
                            onChange={(e) => setConfig({ ...config, smtpUsername: e.target.value })}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="smtpPassword">SMTP Password *</label>
                        <input
                            id="smtpPassword"
                            type="password"
                            placeholder="••••••••"
                            value={config.smtpPassword}
                            onChange={(e) => setConfig({ ...config, smtpPassword: e.target.value })}
                            required={!hasConfig}
                        />
                        <small>⚠️ Password will be encrypted in the database</small>
                    </div>
                </div>

                <div className="form-section">
                    <h4>Email Settings</h4>

                    <div className="input-group">
                        <label htmlFor="fromEmail">From Email Address *</label>
                        <input
                            id="fromEmail"
                            type="email"
                            placeholder="noreply@aganyacore.com"
                            value={config.fromEmail}
                            onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="fromName">From Name</label>
                        <input
                            id="fromName"
                            type="text"
                            placeholder="Aganya Core"
                            value={config.fromName}
                            onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                        />
                    </div>

                    <div className="input-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                            />
                            Enable email notifications
                        </label>
                    </div>
                </div>

                <div className="form-actions">
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Saving...' : hasConfig ? 'Update Configuration' : 'Save Configuration'}
                    </button>
                </div>
            </form>

            {hasConfig && (
                <div className="test-email-section">
                    <div className="test-email-card">
                        <div className="test-email-header">
                            <h4>📨 Test Email Configuration</h4>
                            <p className="subtitle">Send a test email to verify your SMTP settings are working correctly</p>
                        </div>

                        <div className="test-email-body">
                            <div className="input-group">
                                <label htmlFor="testEmail">Recipient Email Address</label>
                                <input
                                    id="testEmail"
                                    type="email"
                                    placeholder="Enter your email address (e.g., test@example.com)"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                />
                                <small>We'll send a test email to this address to verify your configuration</small>
                            </div>

                            <button
                                type="button"
                                className="btn-test-email"
                                onClick={handleTest}
                                disabled={testing || !testEmail}
                            >
                                {testing ? '📤 Sending Test Email...' : '📧 Send Test Email'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="info-box">
                <h4>ℹ️ Email Notifications</h4>
                <p>Email notifications will be sent when:</p>
                <ul>
                    <li>A user is allocated to a project</li>
                    <li>An allocation is updated</li>
                    <li>An allocation is removed</li>
                </ul>
                <p><strong>Note:</strong> Employees must have email addresses configured to receive notifications.</p>
            </div>
        </div>
    );
}

export default SMTPConfig;
