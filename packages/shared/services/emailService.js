/**
 * Email Service
 * Handles sending email notifications using nodemailer
 * (Using nodemailer instead of s-nail for better cross-platform compatibility)
 */

const nodemailer = require('nodemailer');
const SMTPConfigRepository = require('../repositories/smtpConfigRepository');

class EmailService {
    constructor() {
        this.smtpConfigRepo = new SMTPConfigRepository();
        this.transporter = null;
    }

    /**
     * Initialize or refresh email transporter with current SMTP config
     */
    async initializeTransporter() {
        try {
            const config = await this.smtpConfigRepo.get();

            if (!config || !config.enabled) {
                console.log('[EmailService] SMTP not configured or disabled');
                return false;
            }

            this.transporter = nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort,
                secure: config.smtpSecure, // true for 465, false for other ports
                auth: {
                    user: config.smtpUsername,
                    pass: config.smtpPassword
                },
                tls: {
                    rejectUnauthorized: false // For self-signed certificates
                }
            });

            this.fromEmail = config.fromEmail;
            this.fromName = config.fromName;

            return true;
        } catch (error) {
            console.error('[EmailService] Error initializing transporter:', error);
            return false;
        }
    }

    /**
     * Send email
     * @param {Object} options - Email options
     * @param {string[]} options.to - Recipient email addresses
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text body
     * @param {string} options.html - HTML body (optional)
     */
    async sendEmail({ to, subject, text, html }) {
        try {
            // Initialize transporter if not already done
            if (!this.transporter) {
                const initialized = await this.initializeTransporter();
                if (!initialized) {
                    console.log('[EmailService] Email not sent - SMTP not configured');
                    return { success: false, error: 'SMTP not configured' };
                }
            }

            const mailOptions = {
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to.join(', '),
                subject: subject,
                text: text,
                html: html || text.replace(/\n/g, '<br>')
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('[EmailService] Email sent:', info.messageId);

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EmailService] Error sending email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send test email
     * @param {string} testEmail - Test recipient email
     */
    async sendTestEmail(testEmail) {
        return await this.sendEmail({
            to: [testEmail],
            subject: 'Test Email from Aganya Core',
            text: 'This is a test email to verify your SMTP configuration is working correctly.\n\nIf you received this email, your email notification system is properly configured!\n\nBest regards,\nAganya Core Team'
        });
    }

    /**
     * Render allocation created email template
     */
    renderAllocationCreatedEmail(allocation, employee, project) {
        const subject = `You've been allocated to ${project.name}`;

        const text = `Hi ${employee.name},

You have been allocated to the project "${project.name}".

Allocation Details:
- Project: ${project.name}
- Allocation: ${allocation.percentage}%
- Start Date: ${allocation.startDate}
- End Date: ${allocation.endDate}

Please log in to Aganya Core to view more details.

Best regards,
Aganya Core Team`;

        return { subject, text };
    }

    /**
     * Render allocation updated email template
     */
    renderAllocationUpdatedEmail(oldAllocation, newAllocation, employee, project) {
        const subject = `Your allocation to ${project.name} has been updated`;

        const text = `Hi ${employee.name},

Your allocation to "${project.name}" has been updated.

Previous Allocation:
- Percentage: ${oldAllocation.percentage}%
- Dates: ${oldAllocation.startDate} to ${oldAllocation.endDate}

New Allocation:
- Percentage: ${newAllocation.percentage}%
- Dates: ${newAllocation.startDate} to ${newAllocation.endDate}

Please log in to Aganya Core to view more details.

Best regards,
Aganya Core Team`;

        return { subject, text };
    }

    /**
     * Render allocation deleted email template
     */
    renderAllocationDeletedEmail(allocation, employee, project) {
        const subject = `Your allocation to ${project.name} has been removed`;

        const text = `Hi ${employee.name},

Your allocation to "${project.name}" has been removed.

Removed Allocation Details:
- Project: ${project.name}
- Allocation: ${allocation.percentage}%
- Dates: ${allocation.startDate} to ${allocation.endDate}

If you have any questions, please contact your project manager.

Best regards,
Aganya Core Team`;

        return { subject, text };
    }

    /**
     * Get recipient emails for an allocation
     * @param {Object} allocation - Allocation object
     * @param {Object} employee - Employee object
     * @param {Object} project - Project object with assigned_user_id
     */
    async getRecipients(allocation, employee, project) {
        const recipients = [];

        // Add employee email if available
        if (employee.email) {
            recipients.push(employee.email);
        }

        // Add project assigned user email if available
        // TODO: Fetch user email from iam.users table based on project.assigned_user_id
        // For now, we'll just send to the employee

        return [...new Set(recipients)]; // Remove duplicates
    }

    /**
     * Send allocation created notification
     */
    async sendAllocationCreatedNotification(allocation, employee, project) {
        try {
            const recipients = await this.getRecipients(allocation, employee, project);

            if (recipients.length === 0) {
                console.log('[EmailService] No recipients for allocation notification');
                return { success: false, error: 'No recipients' };
            }

            const { subject, text } = this.renderAllocationCreatedEmail(allocation, employee, project);

            return await this.sendEmail({
                to: recipients,
                subject,
                text
            });
        } catch (error) {
            console.error('[EmailService] Error sending allocation created notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send allocation updated notification
     */
    async sendAllocationUpdatedNotification(oldAllocation, newAllocation, employee, project) {
        try {
            const recipients = await this.getRecipients(newAllocation, employee, project);

            if (recipients.length === 0) {
                console.log('[EmailService] No recipients for allocation notification');
                return { success: false, error: 'No recipients' };
            }

            const { subject, text } = this.renderAllocationUpdatedEmail(oldAllocation, newAllocation, employee, project);

            return await this.sendEmail({
                to: recipients,
                subject,
                text
            });
        } catch (error) {
            console.error('[EmailService] Error sending allocation updated notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send allocation deleted notification
     */
    async sendAllocationDeletedNotification(allocation, employee, project) {
        try {
            const recipients = await this.getRecipients(allocation, employee, project);

            if (recipients.length === 0) {
                console.log('[EmailService] No recipients for allocation notification');
                return { success: false, error: 'No recipients' };
            }

            const { subject, text } = this.renderAllocationDeletedEmail(allocation, employee, project);

            return await this.sendEmail({
                to: recipients,
                subject,
                text
            });
        } catch (error) {
            console.error('[EmailService] Error sending allocation deleted notification:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
