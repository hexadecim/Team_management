import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const SystemSettings = ({ token, addToast, settings, onSettingsChange }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [currency, setCurrency] = useState(settings.currency || 'USD');

    useEffect(() => {
        if (settings.currency) setCurrency(settings.currency);
    }, [settings.currency]);

    const handleSaveCurrency = async (newCurrency) => {
        setIsSaving(true);
        try {
            const res = await api.post('/settings', { key: 'currency', value: newCurrency });

            if (res.ok) {
                addToast('Currency setting updated', 'success');
                setCurrency(newCurrency);
                if (onSettingsChange) onSettingsChange();
            } else {
                addToast('Failed to update currency', 'error');
            }
        } catch (err) {
            console.error(err);
            addToast('Error saving settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="system-settings">
            <h3 style={{ margin: 0, marginBottom: '1.5rem' }}>Global Application Settings</h3>

            <div className="card" style={{ padding: '1.5rem', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--fg)' }}>Local Currency</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                            Choose the currency for all financial reports and billing rates.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[
                            { code: 'USD', symbol: '$', label: 'US Dollar' },
                            { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
                            { code: 'EUR', symbol: '€', label: 'Euro' }
                        ].map(curr => (
                            <button
                                key={curr.code}
                                onClick={() => handleSaveCurrency(curr.code)}
                                disabled={isSaving || currency === curr.code}
                                className="action-btn"
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currency === curr.code ? 'var(--col-primary)' : 'white',
                                    color: currency === curr.code ? 'white' : '#64748b',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    opacity: isSaving ? 0.7 : 1
                                }}
                            >
                                {curr.symbol} {curr.code}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                <strong>Tip:</strong> Changing the currency will immediately update all financial dashboards, bench cost calculations, and employee rate displays across the entire organization.
            </div>
        </div>
    );
};

export default SystemSettings;
