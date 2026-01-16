import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import AIConfig from '../../models/AIConfig.js';

class CloudinaryProvider {
    constructor() {
        this.configured = false;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Try to get config from DB first, then Env
        try {
            const config = await AIConfig.findOne({ configKey: "global" });

            // Prioritize config from database if it ever supported it (current model doesn't seem to have specific fields yet, relying on env for now)
            // But checking Env variables is robust.

            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const apiKey = process.env.CLOUDINARY_API_KEY;
            const apiSecret = process.env.CLOUDINARY_API_SECRET;

            if (cloudName && apiKey && apiSecret) {
                cloudinary.config({
                    cloud_name: cloudName,
                    api_key: apiKey,
                    api_secret: apiSecret,
                    secure: true
                });
                this.configured = true;
                console.log("[Cloudinary] Configuration loaded from environment.");
            } else {
                console.warn("[Cloudinary] Missing credentials. Permanent storage is DISABLED.");
            }
        } catch (error) {
            console.error("[Cloudinary] Init error:", error);
        }

        this.initialized = true;
    }

    async uploadImage(buffer, folder = 'generated') {
        if (!this.configured) await this.init();
        if (!this.configured) return null;

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `pixora/${folder}`,
                    resource_type: 'image'
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                        format: result.format,
                        width: result.width,
                        height: result.height
                    });
                }
            );

            streamifier.createReadStream(buffer).pipe(uploadStream);
        });
    }

    async uploadVideo(bufferOrPath, folder = 'generated') {
        if (!this.configured) await this.init();
        if (!this.configured) return null;

        // Clean up checking logic
        const isBuffer = Buffer.isBuffer(bufferOrPath);

        return new Promise((resolve, reject) => {
            if (isBuffer) {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: `pixora/${folder}`,
                        resource_type: 'video',
                        chunk_size: 6000000 // 6MB chunks for better reliability
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve({
                            url: result.secure_url,
                            publicId: result.public_id,
                            format: result.format,
                            duration: result.duration
                        });
                    }
                );
                streamifier.createReadStream(bufferOrPath).pipe(uploadStream);
            } else {
                // It's a file path
                cloudinary.uploader.upload(
                    bufferOrPath,
                    {
                        folder: `pixora/${folder}`,
                        resource_type: 'video',
                        chunk_size: 6000000
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve({
                            url: result.secure_url,
                            publicId: result.public_id,
                            format: result.format,
                            duration: result.duration
                        });
                    }
                );
            }
        });
    }

    async uploadFromUrl(url, type = 'image', folder = 'generated') {
        if (!this.configured) await this.init();
        if (!this.configured) return null;

        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(
                url,
                {
                    folder: `pixora/${folder}`,
                    resource_type: type
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                        format: result.format,

                        // Video specific
                        duration: result.duration
                    });
                }
            );
        });
    }
}

export default new CloudinaryProvider();
