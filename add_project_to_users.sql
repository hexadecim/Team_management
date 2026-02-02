-- Migration: Add assigned_project_id to iam.users
-- This allows users to be associated with a specific project for controlled dashboard views.

ALTER TABLE iam.users 
ADD COLUMN assigned_project_id UUID;

-- Add foreign key reference to core.projects
-- Note: Using references to core schema from iam schema
ALTER TABLE iam.users
ADD CONSTRAINT fk_user_project 
FOREIGN KEY (assigned_project_id) 
REFERENCES core.projects(id) 
ON DELETE SET NULL;

-- Comment for documentation
COMMENT ON COLUMN iam.users.assigned_project_id IS 'Reference to the project assigned to the user for controlled views';
