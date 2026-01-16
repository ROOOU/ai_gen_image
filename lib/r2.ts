/**
 * Cloudflare R2 Storage Client
 * 使用 AWS S3 兼容 API 与 Cloudflare R2 交互
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// R2 配置接口
export interface R2Config {
    accountId: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrl?: string;
}

// 从环境变量加载配置
function loadR2Config(): R2Config | null {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
        console.warn('[R2] Missing R2 configuration, falling back to base64 storage');
        return null;
    }

    return {
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
        publicUrl: process.env.R2_PUBLIC_URL
    };
}

// S3 客户端实例
let s3Client: S3Client | null = null;
let r2Config: R2Config | null = null;

// 获取 S3 客户端
function getS3Client(): S3Client | null {
    if (s3Client) return s3Client;

    r2Config = loadR2Config();
    if (!r2Config) return null;

    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2Config.accessKeyId,
            secretAccessKey: r2Config.secretAccessKey
        }
    });

    return s3Client;
}

/**
 * 检查 R2 是否已配置
 */
export function isR2Configured(): boolean {
    return loadR2Config() !== null;
}

/**
 * 将 base64 图片上传到 R2
 * @param base64Data base64 编码的图片数据 (可以包含 data:image/xxx;base64, 前缀)
 * @param filename 文件名 (不包含扩展名)
 * @returns 公开访问 URL，如果上传失败返回 null
 */
export async function uploadImage(base64Data: string, filename: string): Promise<string | null> {
    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot upload');
        return null;
    }

    try {
        // 解析 base64 数据
        let base64Content = base64Data;
        let mimeType = 'image/png';

        if (base64Data.startsWith('data:')) {
            const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                base64Content = matches[2];
            }
        }

        // 确定文件扩展名
        const extMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif'
        };
        const ext = extMap[mimeType] || 'png';
        const key = `${filename}.${ext}`;

        // 转换为 Buffer
        const buffer = Buffer.from(base64Content, 'base64');

        // 上传到 R2
        const command = new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            CacheControl: 'public, max-age=31536000' // 1 年缓存
        });

        await client.send(command);

        // 构建公开 URL
        let publicUrl: string;
        if (r2Config.publicUrl) {
            publicUrl = `${r2Config.publicUrl.replace(/\/$/, '')}/${key}`;
        } else {
            // 如果没有配置公开 URL，使用默认的 R2.dev 域名
            publicUrl = `https://${r2Config.bucketName}.${r2Config.accountId}.r2.dev/${key}`;
        }

        console.log(`[R2] Uploaded image: ${key}`);
        return publicUrl;

    } catch (error) {
        console.error('[R2] Upload failed:', error);
        return null;
    }
}

/**
 * 从 R2 删除图片
 * @param url 图片 URL 或 key
 */
export async function deleteImage(urlOrKey: string): Promise<boolean> {
    const client = getS3Client();
    if (!client || !r2Config) {
        return false;
    }

    try {
        // 从 URL 提取 key
        let key = urlOrKey;
        if (urlOrKey.startsWith('http')) {
            const url = new URL(urlOrKey);
            key = url.pathname.replace(/^\//, '');
        }

        const command = new DeleteObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key
        });

        await client.send(command);
        console.log(`[R2] Deleted image: ${key}`);
        return true;

    } catch (error) {
        console.error('[R2] Delete failed:', error);
        return false;
    }
}

/**
 * 批量上传图片
 * @param images 图片数组，每个包含 base64 数据
 * @param prefix 文件名前缀
 * @returns 上传结果数组，包含原始数据和新 URL
 */
export async function uploadImages(
    images: Array<{ url: string; base64?: string; title?: string }>,
    prefix: string
): Promise<Array<{ url: string; base64?: string; title?: string }>> {
    if (!isR2Configured()) {
        // R2 未配置，返回原始数据
        return images;
    }

    const results: Array<{ url: string; base64?: string; title?: string }> = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const base64 = img.base64 || img.url;

        // 只处理 base64 数据
        if (base64.startsWith('data:') || !base64.startsWith('http')) {
            const filename = `${prefix}_${i}_${Date.now()}`;
            const uploadedUrl = await uploadImage(base64, filename);

            if (uploadedUrl) {
                results.push({
                    url: uploadedUrl,
                    title: img.title
                    // 不再保存 base64，节省存储空间
                });
            } else {
                // 上传失败，保留原始数据
                results.push(img);
            }
        } else {
            // 已经是 URL，直接使用
            results.push(img);
        }
    }

    return results;
}
