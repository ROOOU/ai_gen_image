/**
 * Cloudflare R2 Storage Client
 * 使用 AWS S3 兼容 API 与 Cloudflare R2 交互
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

    console.log('[R2] Config check:', {
        hasAccountId: !!accountId,
        hasBucketName: !!bucketName,
        hasAccessKeyId: !!accessKeyId,
        hasSecretAccessKey: !!secretAccessKey,
        accountIdPrefix: accountId?.substring(0, 8) + '...',
        bucketName: bucketName
    });

    if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
        console.warn('[R2] Missing R2 configuration, falling back to base64 storage');
        console.warn('[R2] Missing:', {
            accountId: !accountId,
            bucketName: !bucketName,
            accessKeyId: !accessKeyId,
            secretAccessKey: !secretAccessKey
        });
        return null;
    }

    console.log('[R2] Configuration loaded successfully');
    return {
        accountId,
        bucketName,
        accessKeyId,
        secretAccessKey,
        publicUrl: process.env.R2_PUBLIC_URL
    };
}

// S3 客户端实例 - 使用模块级缓存
// Vercel best practice: server-cache-lru 跨请求复用
let s3Client: S3Client | null = null;
let r2Config: R2Config | null = null;
let configLoaded = false;

/**
 * 获取 S3 客户端 (带缓存)
 * 使用 Vercel best practice: Cross-request caching
 * 在 Fluid Compute 环境下，多个请求可以共享同一个函数实例
 */
function getS3Client(): S3Client | null {
    // 如果已经初始化过，直接返回
    if (s3Client) return s3Client;

    // 避免重复加载配置
    if (!configLoaded) {
        r2Config = loadR2Config();
        configLoaded = true;
    }

    if (!r2Config) return null;

    // 创建 S3 客户端 - 复用连接池
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2Config.accessKeyId,
            secretAccessKey: r2Config.secretAccessKey
        },
        // 优化连接配置
        maxAttempts: 3
    });

    console.log('[R2] S3 client initialized');
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
    console.log('[R2] uploadImage called with filename:', filename);

    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot upload. client:', !!client, 'r2Config:', !!r2Config);
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
        console.log('[R2] Uploading to bucket:', r2Config.bucketName, 'key:', key, 'size:', buffer.length);

        // 上传到 R2
        const command = new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            CacheControl: 'public, max-age=31536000' // 1 年缓存
        });

        const result = await client.send(command);
        console.log('[R2] Upload result:', JSON.stringify(result));

        // 构建公开 URL
        let publicUrl: string;
        if (r2Config.publicUrl) {
            publicUrl = `${r2Config.publicUrl.replace(/\/$/, '')}/${key}`;
        } else {
            // 如果没有配置公开 URL，使用默认的 R2.dev 域名
            publicUrl = `https://${r2Config.bucketName}.${r2Config.accountId}.r2.dev/${key}`;
        }

        console.log(`[R2] Uploaded image successfully: ${publicUrl}`);
        return publicUrl;

    } catch (error: any) {
        console.error('[R2] Upload failed:', error.message);
        console.error('[R2] Upload error details:', JSON.stringify({
            name: error.name,
            code: error.Code || error.code,
            stack: error.stack?.substring(0, 500)
        }));
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
 * Vercel best practice: async-parallel
 * 使用 Promise.all 并行上传所有图片，而不是顺序上传
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

    // Vercel best practice: Promise.all for parallel uploads
    // 并行上传所有图片，显著减少总上传时间
    const uploadPromises = images.map(async (img, i) => {
        const base64 = img.base64 || img.url;

        // 只处理 base64 数据
        if (base64.startsWith('data:') || !base64.startsWith('http')) {
            const filename = `${prefix}_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const uploadedUrl = await uploadImage(base64, filename);

            if (uploadedUrl) {
                return {
                    url: uploadedUrl,
                    title: img.title
                    // 不再保存 base64，节省存储空间
                };
            } else {
                // 上传失败，保留原始数据
                return img;
            }
        } else {
            // 已经是 URL，直接使用
            return img;
        }
    });

    // 等待所有上传完成
    const results = await Promise.all(uploadPromises);
    console.log(`[R2] Uploaded ${results.length} images in parallel`);

    return results;
}

/**
 * 历史记录接口
 */
export interface HistoryRecord {
    id: string;
    prompt: string;
    images: Array<{ url: string; base64?: string; title?: string }>;
    text?: string;
    model: string;
    provider: string;
    mode: string;
    createdAt: string;
}

/**
 * 从 R2 加载用户历史记录
 * @param userId 用户 ID
 * @returns 历史记录数组
 */
export async function loadHistoryFromR2(userId: string): Promise<HistoryRecord[]> {
    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot load history');
        return [];
    }

    try {
        const key = `history/${userId}/history.json`;
        const command = new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key
        });

        const response = await client.send(command);
        const body = await response.Body?.transformToString();

        if (body) {
            return JSON.parse(body) as HistoryRecord[];
        }
        return [];
    } catch (error: any) {
        // NoSuchKey 错误表示历史记录不存在，这是正常的
        if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
            return [];
        }
        console.error('[R2] Failed to load history:', error.message);
        return [];
    }
}

/**
 * 将用户历史记录保存到 R2
 * @param userId 用户 ID
 * @param history 历史记录数组
 */
export async function saveHistoryToR2(userId: string, history: HistoryRecord[]): Promise<boolean> {
    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot save history');
        return false;
    }

    try {
        const key = `history/${userId}/history.json`;
        const body = JSON.stringify(history, null, 2);

        const command = new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
            Body: body,
            ContentType: 'application/json'
        });

        await client.send(command);
        console.log(`[R2] Saved history for user ${userId}, ${history.length} records`);
        return true;
    } catch (error: any) {
        console.error('[R2] Failed to save history:', error.message);
        return false;
    }
}

/**
 * 用户数据接口
 */
export interface UserData {
    id: string;
    email: string;
    username: string;
    password: string;
    avatar?: string;
    credits: number;
    createdAt: string;
}

/**
 * 从 R2 加载所有用户数据
 * 用于 Vercel 无服务器环境下的持久化存储
 */
export async function loadUsersFromR2(): Promise<UserData[]> {
    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot load users');
        return [];
    }

    try {
        const key = 'system/users.json';
        const command = new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key
        });

        const response = await client.send(command);
        const body = await response.Body?.transformToString();

        if (body) {
            const users = JSON.parse(body) as UserData[];
            console.log(`[R2] Loaded ${users.length} users from R2`);
            return users;
        }
        return [];
    } catch (error: any) {
        // NoSuchKey 表示还没有用户数据
        if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
            console.log('[R2] No users.json found, starting fresh');
            return [];
        }
        console.error('[R2] Failed to load users:', error.message);
        return [];
    }
}

/**
 * 将用户数据保存到 R2
 * 用于 Vercel 无服务器环境下的持久化存储
 */
export async function saveUsersToR2(users: UserData[]): Promise<boolean> {
    const client = getS3Client();
    if (!client || !r2Config) {
        console.warn('[R2] R2 not configured, cannot save users');
        return false;
    }

    try {
        const key = 'system/users.json';
        const body = JSON.stringify(users, null, 2);

        const command = new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
            Body: body,
            ContentType: 'application/json'
        });

        await client.send(command);
        console.log(`[R2] Saved ${users.length} users to R2`);
        return true;
    } catch (error: any) {
        console.error('[R2] Failed to save users:', error.message);
        return false;
    }
}
