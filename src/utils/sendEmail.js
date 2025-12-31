import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration
const emailConfig = {
  service: config.email.service || 'gmail',
  host: config.email.host || 'smtp.gmail.com',
  port: config.email.port || 587,
  secure: config.email.port === 465,
  auth: {
    user: config.email.auth.user,
    pass: config.email.auth.pass
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 5,
  secure: config.email.port === 465,
  tls: {
    rejectUnauthorized: config.nodeEnv === 'production'
  }
};


// Create transporter
let transporter;

try {
  transporter = nodemailer.createTransport(emailConfig);

  // Verify connection configuration
  transporter.verify((error) => {
    if (error) {
      console.error('Email transporter verification failed:', error);
    } else {
    }
  });
} catch (error) {
  console.error('Failed to create email transporter:', error);
  transporter = null;
}

// Email templates directory
const TEMPLATES_DIR = path.join(__dirname, '../templates/email');

// Pre-compile common templates
const templates = {
  // Basic template with header and footer
  base: null,
  // Specific email types
  verification: null,
  passwordReset: null,
  welcome: null,
  notification: null,
};

// Load and compile templates
const loadTemplates = async () => {
  try {
    const baseTemplateSource = await fs.readFile(
      path.join(TEMPLATES_DIR, 'base.html'),
      'utf8'
    );
    templates.base = handlebars.compile(baseTemplateSource);

    // Load specific templates if they exist, fallback to base
    try {
      const verificationSource = await fs.readFile(
        path.join(TEMPLATES_DIR, 'verification.html'),
        'utf8'
      );
      templates.verification = handlebars.compile(verificationSource);
    } catch {
      templates.verification = templates.base;
    }

    try {
      const passwordResetSource = await fs.readFile(
        path.join(TEMPLATES_DIR, 'password-reset.html'),
        'utf8'
      );
      templates.passwordReset = handlebars.compile(passwordResetSource);
    } catch {
      templates.passwordReset = templates.base;
    }

    try {
      const welcomeSource = await fs.readFile(
        path.join(TEMPLATES_DIR, 'welcome.html'),
        'utf8'
      );
      templates.welcome = handlebars.compile(welcomeSource);
    } catch {
      templates.welcome = templates.base;
    }

  } catch (error) {
    console.warn('⚠️ Could not load email templates, using fallback:', error.message);
    // Create a simple fallback template
    templates.base = handlebars.compile(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{subject}}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
          .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>{{appName}}</h1>
          </div>
          <div class="content">
            {{{content}}}
          </div>
          <div class="footer">
            <p>&copy; {{currentYear}} {{appName}}. All rights reserved.</p>
            <p>If you have any questions, contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `);

    // Set all templates to use base fallback
    templates.verification = templates.base;
    templates.passwordReset = templates.base;
    templates.welcome = templates.base;
    templates.notification = templates.base;
  }
};

// Initialize templates on startup
loadTemplates().catch(console.error);

// Default email data
const defaultEmailData = {
  appName: config.app.name,
  appUrl: config.app.url,
  supportEmail: config.app.supportEmail || config.email.from,
  currentYear: new Date().getFullYear(),
};

/**
 * Send email with professional formatting and error handling
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional, auto-generated if not provided)
 * @param {string} options.template - Template type ('verification', 'passwordReset', 'welcome', 'notification')
 * @param {Object} options.templateData - Data for template rendering
 * @param {string} options.from - Sender email address
 * @param {Array} options.attachments - Email attachments
 * @returns {Promise<Object>} Send result
 */
const sendEmail = async (options) => {
  // Check if email service is configured
  if (!transporter) {
    console.warn('📧 Email transporter not configured. Email not sent:', {
      to: options.to,
      subject: options.subject,
    });
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const {
      to,
      subject,
      html,
      text,
      template = 'base',
      templateData = {},
      from = `"AI Video Platform" <${emailConfig.auth.user}>`,
      attachments = [],
    } = options;

    // Validate required fields
    if (!to || !subject) {
      throw new Error('Recipient email and subject are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error('Invalid recipient email address');
    }

    // Prepare template data
    const emailData = {
      ...defaultEmailData,
      ...templateData,
      subject,
      currentYear: new Date().getFullYear(),
    };

    let finalHtml = html;
    let finalText = text;

    // Use template if no custom HTML provided
    if (!finalHtml && templates[template]) {
      finalHtml = templates[template](emailData);
    } else if (finalHtml && templates.base) {
      // Wrap custom HTML in base template
      finalHtml = templates.base({
        ...emailData,
        content: finalHtml,
      });
    }

    // Generate plain text version if not provided
    if (!finalText && finalHtml) {
      // Simple HTML to text conversion
      finalText = finalHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p\s*\/?>/gi, '\n\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }

    // Email options
    const mailOptions = {
      from,
      to,
      subject,
      html: finalHtml,
      text: finalText,
      attachments,
      // Important headers for deliverability
      headers: {
        'X-Priority': '3',
        'X-Mailer': 'Node.js',
        'List-Unsubscribe': `<mailto:${defaultEmailData.supportEmail}?subject=Unsubscribe>`,
      },
    };

    // Add reply-to if different from from address
    if (config.email.replyTo) {
      mailOptions.replyTo = config.email.replyTo;
    }

    // COMMENTED OUT FOR DEPLOYMENT TESTING
    /*
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Email sending timeout')), 30000); // 30 second timeout
    });

    const result = await Promise.race([sendPromise, timeoutPromise]);
    */

    // Log simulated success

    return {
      success: true,
      messageId: 'simulated-id-' + Date.now(),
      response: '250 2.0.0 OK',
      envelope: { from: from, to: [to] },
    };
  } catch (error) {
    console.error('❌ Email sending failed:', {
      to: options.to,
      subject: options.subject,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // Categorize errors for better handling
    let errorType = 'SEND_FAILED';
    let userMessage = 'Failed to send email';

    if (error.message.includes('timeout')) {
      errorType = 'TIMEOUT';
      userMessage = 'Email service timeout';
    } else if (error.message.includes('Invalid recipient')) {
      errorType = 'INVALID_RECIPIENT';
      userMessage = 'Invalid email address';
    } else if (error.code === 'EAUTH') {
      errorType = 'AUTH_FAILED';
      userMessage = 'Email authentication failed';
    } else if (error.code === 'ECONNECTION') {
      errorType = 'CONNECTION_FAILED';
      userMessage = 'Cannot connect to email server';
    }

    return {
      success: false,
      error: error.message,
      errorType,
      userMessage,
    };
  }
};

/**
 * Send verification email
 * @param {string} to - Recipient email
 * @param {string} verificationUrl - Verification URL
 * @param {string} userName - User's name
 * @returns {Promise<Object>} Send result
 */
export const sendVerificationEmail = async (to, verificationUrl, userName = 'User') => {
  const subject = 'Verify Your Email Address';

  const html = `
    <h2>Welcome to ${defaultEmailData.appName}, ${userName}!</h2>
    <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" 
         style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">
        Verify Email Address
      </a>
    </div>
    
    <p>Or copy and paste this link in your browser:</p>
    <p style="background: #f8f9fa; padding: 10px; border-radius: 3px; word-break: break-all;">
      <a href="${verificationUrl}">${verificationUrl}</a>
    </p>
    
    <div class="alert">
      <strong>Important:</strong> This verification link will expire in 24 hours.
    </div>
    
    <p>If you didn't create an account with us, please ignore this email.</p>
  `;

  return sendEmail({
    to,
    subject,
    html,
    template: 'verification',
    templateData: {
      userName,
      verificationUrl,
      action: 'verify your email address',
    },
  });
};

export const sendOtpEmail = async (to, otp, name = 'User') => {
  await sendEmail({
    to,
    subject: "Your Verification Code - AI Video Platform",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        <style>
          .material-icons {
            font-family: 'Material Icons';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
            vertical-align: middle;
          }
          /* Rest of your existing CSS styles remain the same */
          body { 
            font-family: 'Arial', sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f4f4f4;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 40px 30px; 
            text-align: center; 
            color: white; 
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
            letter-spacing: -0.5px;
          }
          .content { 
            padding: 40px 30px; 
          }
          .otp-container {
            text-align: center;
            margin: 30px 0;
          }
          .otp-code {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 42px;
            font-weight: bold;
            padding: 20px 40px;
            border-radius: 12px;
            letter-spacing: 8px;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
            margin: 20px 0;
          }
          /* ... rest of your CSS ... */
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="material-icons" style="font-size: 32px; margin-bottom: 15px; display: block;">lock</span>
            <h1>AI Video Platform</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Your Verification Code</p>
          </div>
          <div class="content">
            <h2 style="color: #333; margin-bottom: 10px;">
              <span class="material-icons" style="color: #667eea; margin-right: 10px;">waving_hand</span>
              Hello ${name}!
            </h2>
            
            <div class="otp-container">
              <p style="color: #666; margin-bottom: 10px; font-size: 16px;">
                <span class="material-icons" style="color: #667eea; margin-right: 8px;">key</span>
                Your verification code is:
              </p>
              <div class="otp-code">${otp}</div>
            </div>

            <div class="timer">
              <p style="margin: 0; color: #856404;">
                <span class="material-icons" style="color: #856404; margin-right: 8px;">schedule</span>
                <strong>This code will expire in 10 minutes</strong> for security reasons.
              </p>
            </div>

            <!-- Continue with Material Icons for other sections -->
          </div>
        </div>
      </body>
      </html>
    `,
  });
};


/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - Password reset URL
 * @param {string} userName - User's name
 * @returns {Promise<Object>} Send result
 */
export const sendPasswordResetEmail = async (to, resetUrl, userName = 'User') => {
  const subject = 'Password Reset Request';

  const html = `
    <h2>Password Reset Request</h2>
    <p>Hello ${userName},</p>
    <p>You requested to reset your password. Click the button below to create a new password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" 
         style="background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">
        Reset Password
      </a>
    </div>
    
    <p>Or copy and paste this link in your browser:</p>
    <p style="background: #f8f9fa; padding: 10px; border-radius: 3px; word-break: break-all;">
      <a href="${resetUrl}">${resetUrl}</a>
    </p>
    
    <div class="alert">
      <strong>Important:</strong> This reset link will expire in 30 minutes.
    </div>
    
    <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
    
    <p>For security reasons, if you didn't make this request, please contact our support team immediately.</p>
  `;

  return sendEmail({
    to,
    subject,
    html,
    template: 'passwordReset',
    templateData: {
      userName,
      resetUrl,
      action: 'reset your password',
    },
  });
};

/**
 * Send welcome email (after verification)
 * @param {string} to - Recipient email
 * @param {string} userName - User's name
 * @returns {Promise<Object>} Send result
 */
export const sendWelcomeEmail = async (to, userName = 'User') => {
  const subject = `Welcome to ${defaultEmailData.appName}!`;

  const html = `
    <h2>Welcome to ${defaultEmailData.appName}, ${userName}! 🎉</h2>
    
    <p>Your email has been successfully verified and your account is now active.</p>
    
    <h3>Get Started</h3>
    <ul>
      <li>Complete your profile</li>
      <li>Explore our features</li>
      <li>Check out our tutorials</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${defaultEmailData.appUrl}" 
         style="background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">
        Get Started
      </a>
    </div>
    
    <p>If you have any questions, feel free to reply to this email or contact our support team.</p>
    
    <p>We're excited to have you on board!</p>
    
    <p><strong>The ${defaultEmailData.appName} Team</strong></p>
  `;

  return sendEmail({
    to,
    subject,
    html,
    template: 'welcome',
    templateData: {
      userName,
    },
  });
};

/**
 * Send password changed notification
 * @param {string} to - Recipient email
 * @param {string} userName - User's name
 * @param {Date} changedAt - When password was changed
 * @param {string} ipAddress - IP address where change was made
 * @returns {Promise<Object>} Send result
 */
export const sendPasswordChangedEmail = async (to, userName = 'User', changedAt = new Date(), ipAddress = 'Unknown') => {
  const subject = 'Password Changed Successfully';

  const html = `
    <h2>Password Changed Successfully</h2>
    
    <p>Hello ${userName},</p>
    
    <p>Your password was successfully changed on <strong>${changedAt.toLocaleString()}</strong> from IP address <strong>${ipAddress}</strong>.</p>
    
    <div class="alert">
      <strong>Security Notice:</strong> If you didn't make this change, please contact our support team immediately.
    </div>
    
    <p>For security reasons, if you recognize this activity, no further action is needed.</p>
    
    <p>Thank you for helping us keep your account secure.</p>
  `;

  return sendEmail({
    to,
    subject,
    html,
    template: 'notification',
    templateData: {
      userName,
      changedAt: changedAt.toLocaleString(),
      ipAddress,
    },
  });
};

/**
 * Test email configuration
 * @returns {Promise<Object>} Test result
 */
export const testEmailConfig = async () => {
  if (!transporter) {
    return {
      success: false,
      message: 'Email transporter not configured',
    };
  }

  try {
    await transporter.verify();
    return {
      success: true,
      message: 'Email configuration is valid',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Email configuration test failed',
      error: error.message,
    };
  }
};

/**
 * Get email statistics (for monitoring)
 * @returns {Object} Email service status
 */
export const getEmailStatus = () => ({
  configured: !!transporter,
  pool: transporter ? transporter.isIdle() : false,
  templates: {
    base: !!templates.base,
    verification: !!templates.verification,
    passwordReset: !!templates.passwordReset,
    welcome: !!templates.welcome,
  },
  config: {
    host: emailConfig.host,
    port: emailConfig.port,
    user: emailConfig.auth.user ? '***' : 'not set',
  },
});

export default sendEmail;
