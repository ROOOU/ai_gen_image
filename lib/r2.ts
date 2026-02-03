import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

// R2 配置
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''; // 公开访问 URL 前缀

// 创建 S3 客户端（兼容 R2）
const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

// 历史记录项接口
export interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageKey: string;      // R2 中的图片 key
    aspectRatio?: string;
}

/**
 * 根据 API Key 生成用户 ID（SHA-256 哈希，取前 16 位）
 * 这样可以保护用户的 API Key 不被存储
 */
export function getUserIdFromApiKey(apiKey: string): string {
    if (!apiKey) return 'anonymous';
    const hash = createHash('sha256').update(apiKey).digest('hex');
    return hash.substring(0, 16);
}

/**
 * 获取用户专属的历史记录文件路径
 */
function getHistoryFileKey(userId: string): string {
    return `history/${userId}/history.json`;
}

/**
 * 获取用户专属的图片存储路径
 */
function getImageKey(userId: string, imageId: string): string {
    return `images/${userId}/${imageId}.jpg`;
}

/**
 * 获取用户专属的缩略图存储路径
 */
function getThumbnailKey(userId: string, imageId: string): string {
    return `images/${userId}/${imageId}_thumb.jpg`;
}

/**
 * 检查 R2 是否已配置
 */
export function isR2Configured(): boolean {
    return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

/**
 * 上传图片到 R2（按用户存储）
 */
export async function uploadImage(
    imageData: string,
    imageId: string,
    userId: string,
    mimeType: string = 'image/jpeg'
): Promise<string> {
    // 从 base64 data URL 提取数据
    const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const key = getImageKey(userId, imageId);

    await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
    }));

    return key;
}

/**
 * 上传缩略图到 R2
 */
export async function uploadThumbnail(
    thumbnailData: string,
    imageId: string,
    userId: string
): Promise<string> {
    const base64Data = thumbnailData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const key = getThumbnailKey(userId, imageId);

    await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
    }));

    return key;
}

/**
 * 获取图片的公开 URL
 */
export function getImageUrl(imageKey: string): string {
    if (R2_PUBLIC_URL) {
        return `${R2_PUBLIC_URL}/${imageKey}`;
    }
    // 如果没有配置公开 URL，返回 API 代理路径
    return `/api/history/image?key=${encodeURIComponent(imageKey)}`;
}

/**
 * 获取缩略图的公开 URL
 */
export function getThumbnailUrl(imageKey: string): string {
    // 将原图 key 转换为缩略图 key
    const thumbKey = imageKey.replace('.jpg', '_thumb.jpg');
    return getImageUrl(thumbKey);
}

/**
 * 从 R2 读取图片
 */
export async function getImage(imageKey: string): Promise<Buffer | null> {
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: imageKey,
        }));

        if (response.Body) {
            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as any) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        return null;
    } catch (error) {
        console.error('Error getting image from R2:', error);
        return null;
    }
}

/**
 * 删除图片
 */
export async function deleteImage(imageKey: string): Promise<boolean> {
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: imageKey,
        }));
        return true;
    } catch (error) {
        console.error('Error deleting image from R2:', error);
        return false;
    }
}

/**
 * 读取用户的历史记录
 */
export async function loadHistory(userId: string): Promise<HistoryItem[]> {
    try {
        const historyFileKey = getHistoryFileKey(userId);
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: historyFileKey,
        }));

        if (response.Body) {
            const bodyContents = await response.Body.transformToString();
            return JSON.parse(bodyContents);
        }
        return [];
    } catch (error: any) {
        // 如果文件不存在，返回空数组
        if (error.name === 'NoSuchKey') {
            return [];
        }
        console.error('Error loading history from R2:', error);
        return [];
    }
}

/**
 * 保存用户的历史记录
 */
export async function saveHistory(userId: string, history: HistoryItem[]): Promise<boolean> {
    try {
        const historyFileKey = getHistoryFileKey(userId);
        await s3Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: historyFileKey,
            Body: JSON.stringify(history, null, 2),
            ContentType: 'application/json',
        }));
        return true;
    } catch (error) {
        console.error('Error saving history to R2:', error);
        return false;
    }
}

/**
 * 添加历史记录项
 */
export async function addHistoryItem(userId: string, item: HistoryItem): Promise<boolean> {
    try {
        const history = await loadHistory(userId);
        // 添加到开头（最新的在前）
        history.unshift(item);
        // 限制保存最近 100 条记录
        const trimmedHistory = history.slice(0, 100);
        return await saveHistory(userId, trimmedHistory);
    } catch (error) {
        console.error('Error adding history item:', error);
        return false;
    }
}

/**
 * 删除历史记录项
 */
export async function deleteHistoryItem(userId: string, id: string): Promise<boolean> {
    try {
        const history = await loadHistory(userId);
        const item = history.find(h => h.id === id);

        if (item) {
            // 删除图片
            await deleteImage(item.imageKey);

            // 从历史中移除
            const newHistory = history.filter(h => h.id !== id);
            return await saveHistory(userId, newHistory);
        }
        return false;
    } catch (error) {
        console.error('Error deleting history item:', error);
        return false;
    }
}
