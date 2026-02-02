/**
 * Role Repository - PostgreSQL Implementation
 * 
 * Manages roles in the iam.roles table
 */

const { db } = require('@team-mgmt/shared');

class RoleRepository {
    /**
     * Get all roles
     * @returns {Promise<Array>} Array of role objects
     */
    async getAll() {
        const result = await db.queryIAM('SELECT id, name, permissions FROM iam.roles ORDER BY name');
        return result.rows;
    }

    /**
     * Get a role by name
     * @param {string} name - Role name
     * @returns {Promise<Object|null>} Role object or null if not found
     */
    async getByName(name) {
        const result = await db.queryIAM('SELECT id, name, permissions FROM iam.roles WHERE name = $1', [name]);
        return result.rows[0] || null;
    }

    /**
     * Create a new role
     * @param {Object} role - Role object with name and permissions
     * @returns {Promise<Object>} Created role object
     * @throws {Error} If role already exists
     */
    async create(role) {
        try {
            const result = await db.queryIAM(
                'INSERT INTO iam.roles (name, permissions) VALUES ($1, $2) RETURNING id, name, permissions',
                [role.name, JSON.stringify(role.permissions)]
            );
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                throw new Error('Role already exists');
            }
            throw error;
        }
    }

    /**
     * Update a role
     * @param {number} id - Role ID
     * @param {Object} role - Role object with name and permissions
     * @returns {Promise<Object|null>} Updated role object or null if not found
     */
    async update(id, role) {
        try {
            const result = await db.queryIAM(
                'UPDATE iam.roles SET name = $1, permissions = $2 WHERE id = $3 RETURNING id, name, permissions',
                [role.name, JSON.stringify(role.permissions), id]
            );
            return result.rows[0] || null;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Role name already exists');
            }
            throw error;
        }
    }

    /**
     * Delete a role by ID
     * @param {number} id - Role ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const result = await db.queryIAM('DELETE FROM iam.roles WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
}

module.exports = new RoleRepository();
