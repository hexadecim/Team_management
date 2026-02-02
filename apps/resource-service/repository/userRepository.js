/**
 * User Repository - PostgreSQL Implementation
 * 
 * Manages users in the iam.users table
 */

const { db } = require('@team-mgmt/shared');

class UserRepository {
    /**
     * Get all users (excluding passwords)
     * @returns {Promise<Array>} Array of user objects
     */
    async getAll() {
        const queryText = `
            SELECT u.username, 
                   ARRAY_AGG(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL) as project_ids,
                   ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
                   ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles
            FROM iam.users u
            LEFT JOIN iam.user_projects up ON u.username = up.username
            LEFT JOIN core.projects p ON up.project_id = p.id
            LEFT JOIN iam.user_roles ur ON u.username = ur.username
            LEFT JOIN iam.roles r ON ur.role_id = r.id
            GROUP BY u.username
            ORDER BY u.username
        `;
        const result = await db.queryIAM(queryText);
        return result.rows.map(u => ({
            username: u.username,
            project_ids: u.project_ids || [],
            project_names: u.project_names || [],
            roles: u.roles || []
        }));
    }

    /**
     * Find a user by username (includes password for authentication)
     * @param {string} username - Username
     * @returns {Promise<Object|null>} User object or null if not found
     */
    async findByUsername(username) {
        const queryText = `
            SELECT u.username, u.password,
                   ARRAY_AGG(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL) as project_ids,
                   ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
                   ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles
            FROM iam.users u
            LEFT JOIN iam.user_projects up ON u.username = up.username
            LEFT JOIN core.projects p ON up.project_id = p.id
            LEFT JOIN iam.user_roles ur ON u.username = ur.username
            LEFT JOIN iam.roles r ON ur.role_id = r.id
            WHERE u.username = $1
            GROUP BY u.username, u.password
        `;
        const result = await db.queryIAM(queryText, [username]);
        if (!result.rows[0]) return null;

        const user = result.rows[0];
        return {
            username: user.username,
            password: user.password,
            project_ids: user.project_ids || [],
            project_names: user.project_names || [],
            roles: user.roles || []
        };
    }

    /**
     * Create a new user
     * @param {Object} user - User object with username, password, roles, and assigned_project_id
     * @returns {Promise<Object>} Created user object (without password)
     * @throws {Error} If user already exists
     */
    async create(user) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const userResult = await client.query(
                'INSERT INTO iam.users (username, password, role_names) VALUES ($1, $2, $3) RETURNING username',
                [user.username, user.password, user.roles || []]
            );

            if (user.roles && user.roles.length > 0) {
                for (const roleName of user.roles) {
                    await client.query(
                        'INSERT INTO iam.user_roles (username, role_id) SELECT $1, id FROM iam.roles WHERE name = $2',
                        [user.username, roleName]
                    );
                }
            }

            if (user.project_ids && user.project_ids.length > 0) {
                for (const projectId of user.project_ids) {
                    await client.query(
                        'INSERT INTO iam.user_projects (username, project_id) VALUES ($1, $2)',
                        [user.username, projectId]
                    );
                }
            } else if (user.assigned_project_id) {
                // Support legacy single project field during transition
                await client.query(
                    'INSERT INTO iam.user_projects (username, project_id) VALUES ($1, $2)',
                    [user.username, user.assigned_project_id]
                );
            }

            await client.query('COMMIT');
            return {
                username: userResult.rows[0].username,
                project_ids: user.project_ids || (user.assigned_project_id ? [user.assigned_project_id] : []),
                roles: user.roles || []
            };
        } catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505') {
                throw new Error('User already exists');
            }
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update user roles
     * @param {string} username - Username
     * @param {Array} newRoles - Array of role names
     * @returns {Promise<Object|null>} Updated user object or null if not found
     */
    async updateRoles(username, newRoles) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Delete old roles
            await client.query('DELETE FROM iam.user_roles WHERE username = $1', [username]);

            // Sync role_names array for backward compatibility
            await client.query('UPDATE iam.users SET role_names = $1 WHERE username = $2', [newRoles, username]);

            // Insert new roles
            if (newRoles && newRoles.length > 0) {
                for (const roleName of newRoles) {
                    await client.query(
                        'INSERT INTO iam.user_roles (username, role_id) SELECT $1, id FROM iam.roles WHERE name = $2',
                        [username, roleName]
                    );
                }
            }

            await client.query('COMMIT');
            return { username, roles: newRoles };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update user projects
     * @param {string} username - Username
     * @param {Array} projectIds - Array of project UUIDs
     * @returns {Promise<Object|null>} Updated user object or null if not found
     */
    async updateProjects(username, projectIds) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Delete old project assignments
            await client.query('DELETE FROM iam.user_projects WHERE username = $1', [username]);

            // Insert new project assignments
            if (projectIds && projectIds.length > 0) {
                for (const projectId of projectIds) {
                    await client.query(
                        'INSERT INTO iam.user_projects (username, project_id) VALUES ($1, $2)',
                        [username, projectId]
                    );
                }
            }

            // Sync legacy field for backward compatibility (if first project exists)
            const firstProject = projectIds && projectIds.length > 0 ? projectIds[0] : null;
            await client.query('UPDATE iam.users SET assigned_project_id = $1 WHERE username = $2', [firstProject, username]);

            await client.query('COMMIT');
            return { username, project_ids: projectIds };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update user password
     * @param {string} username - Username
     * @param {string} newPassword - New password
     * @returns {Promise<boolean>} True if updated
     */
    async updatePassword(username, newPassword) {
        const result = await db.queryIAM(
            'UPDATE iam.users SET password = $1 WHERE username = $2',
            [newPassword, username]
        );
        return result.rowCount > 0;
    }

    /**
     * Delete a user by username
     * @param {string} username - Username
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(username) {
        const result = await db.queryIAM('DELETE FROM iam.users WHERE username = $1', [username]);
        return result.rowCount > 0;
    }
}

module.exports = new UserRepository();
