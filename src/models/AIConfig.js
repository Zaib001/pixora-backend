import mongoose from "mongoose";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "pixora_default_key_change_in_prod_32chars";
const ALGORITHM = "aes-256-cbc";

const aiConfigSchema = new mongoose.Schema(
    {
        configKey: {
            type: String,
            required: true,
            unique: true,
            default: "global",
        },
        // Encrypted API Keys
        apiKeys: {
            competapi: {
                encrypted: String,
                iv: String,
                masked: String, // For display purposes
                lastUpdated: Date,
            },
            openai: {
                encrypted: String,
                iv: String,
                masked: String,
                lastUpdated: Date,
            },
            deepseek: {
                encrypted: String,
                iv: String,
                masked: String,
                lastUpdated: Date,
            },
        },
        // Rate Limiting
        rateLimits: {
            maxConcurrentGenerations: {
                type: Number,
                default: 10,
            },
            maxRequestsPerMinute: {
                type: Number,
                default: 60,
            },
            maxRequestsPerHour: {
                type: Number,
                default: 1000,
            },
        },
        // Timeout Configuration
        timeouts: {
            requestTimeout: {
                type: Number,
                default: 120000, // 2 minutes
            },
            generationTimeout: {
                type: Number,
                default: 300000, // 5 minutes
            },
            statusCheckInterval: {
                type: Number,
                default: 5000, // 5 seconds
            },
        },
        // Webhook Configuration
        webhooks: {
            aiCompletionUrl: String,
            aiFailureUrl: String,
            secret: String,
        },
        // Feature Toggles
        features: {
            enableMockMode: {
                type: Boolean,
                default: false,
            },
            enableAIIdeas: {
                type: Boolean,
                default: true,
            },
            enableAsyncGeneration: {
                type: Boolean,
                default: true,
            },
            enableRetryOnFailure: {
                type: Boolean,
                default: true,
            },
            maxRetries: {
                type: Number,
                default: 3,
            },
        },
        // Integrations
        integrations: {
            tidioEnabled: {
                type: Boolean,
                default: true,
            },
            tidioScriptId: {
                type: String,
                default: "hq4xyf3vsguzrmfqwys6kodan18zxbdk",
            },
        },
    },
    {
        timestamps: true,
    }
);

// Helper function to encrypt
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return {
        encrypted,
        iv: iv.toString("hex"),
    };
}

// Helper function to decrypt
function decrypt(encrypted, ivHex) {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// Helper function to mask API key
function maskApiKey(key) {
    if (!key || key.length < 8) return "****";
    return key.slice(0, 6) + "*".repeat(key.length - 10) + key.slice(-4);
}

// Method to set encrypted API key
aiConfigSchema.methods.setApiKey = function (provider, apiKey) {
    if (!apiKey) return;

    const { encrypted, iv } = encrypt(apiKey);

    if (!this.apiKeys[provider]) {
        this.apiKeys[provider] = {};
    }

    this.apiKeys[provider].encrypted = encrypted;
    this.apiKeys[provider].iv = iv;
    this.apiKeys[provider].masked = maskApiKey(apiKey);
    this.apiKeys[provider].lastUpdated = new Date();
};

// Method to get decrypted API key
aiConfigSchema.methods.getApiKey = function (provider) {
    const apiKeyData = this.apiKeys[provider];
    if (!apiKeyData || !apiKeyData.encrypted || !apiKeyData.iv) {
        return null;
    }

    try {
        return decrypt(apiKeyData.encrypted, apiKeyData.iv);
    } catch (error) {
        console.error(`Failed to decrypt ${provider} API key:`, error);
        return null;
    }
};

// Method to get all masked keys (for display)
aiConfigSchema.methods.getMaskedKeys = function () {
    const masked = {};
    for (const provider in this.apiKeys) {
        if (this.apiKeys[provider]?.masked) {
            masked[provider] = this.apiKeys[provider].masked;
        }
    }
    return masked;
};

const AIConfig = mongoose.model("AIConfig", aiConfigSchema);

export default AIConfig;
