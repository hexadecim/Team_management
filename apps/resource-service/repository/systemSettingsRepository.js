const { db } = require('@team-mgmt/shared');

class SystemSettingsRepository {
    async getAll() {
        const query = 'SELECT key, value FROM core.system_settings';
        const result = await db.queryCore(query);
        // Convert array to key-value object
        return result.rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
    }

    async getByKey(key) {
        const query = 'SELECT value FROM core.system_settings WHERE key = $1';
        const result = await db.queryCore(query, [key]);
        return result.rows[0]?.value || null;
    }

    async update(key, value) {
        const query = `
            INSERT INTO core.system_settings (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        const result = await db.queryCore(query, [key, value]);
        return result.rows[0];
    }
}

module.exports = new SystemSettingsRepository();
