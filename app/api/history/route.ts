import { NextResponse } from 'next/server';
import {
    isR2Configured,
    loadHistory,
    addHistoryItem,
    deleteHistoryItem,
    uploadImage,
    uploadThumbnail,
    getImageUrl,
    getThumbnailUrl,
    getUserIdFromApiKey,
    uploadInputImageWithDedup,
    HistoryItem,
} from '@/lib/r2';

interface CreateHistoryRequestBody {
    imageData?: string;
    thumbnailData?: string;
    inputImageData?: string;          // 旧版单图兼容
    inputImageMimeType?: string;
    inputImagesData?: string[];       // 多图
    prompt?: string;
    mode?: 'text2img' | 'img2img' | 'outpaint';
    model?: string;
    aspectRatio?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

/**
 * GET /api/history
 * 获取历史记录列表
 * 
 * Headers:
 * - x-api-key: 用户的 API Key（用于区分不同用户的历史记录）
 */
export async function GET(request: Request) {
    try {
        console.log('[History API] GET - Checking R2 configuration...');
        if (!isR2Configured()) {
            console.error('[History API] GET - R2 not configured');
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        // 从请求头或环境变量获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY || '';
        const userId = getUserIdFromApiKey(apiKey);
        console.log('[History API] GET - userId:', userId, 'apiKey length:', apiKey.length);

        const history = await loadHistory(userId);
        console.log('[History API] GET - Loaded history items:', history.length);

        // 为每个记录添加图片 URL 和缩略图 URL（兼容旧版单图 + 新版多图）
        const historyWithUrls = history.map(item => {
            const allInputKeys = item.inputImageKeys || (item.inputImageKey ? [item.inputImageKey] : []);
            return {
                ...item,
                imageUrl: getImageUrl(item.imageKey),
                thumbnailUrl: getThumbnailUrl(item.imageKey),
                inputImageUrls: allInputKeys.map((k: string) => getImageUrl(k)),
            };
        });

        return NextResponse.json({
            success: true,
            history: historyWithUrls,
        });
    } catch (error: unknown) {
        console.error('[History API] GET error:', error);
        return NextResponse.json({
            success: false,
            error: getErrorMessage(error, '获取历史记录失败'),
        }, { status: 500 });
    }
}

/**
 * POST /api/history
 * 添加新的历史记录
 * 
 * Headers:
 * - x-api-key: 用户的 API Key（用于区分不同用户的历史记录）
 * 
 * Body:
 * - imageData: string (base64 data URL)
 * - prompt: string
 * - mode: 'text2img' | 'img2img' | 'outpaint'
 * - model: string
 * - aspectRatio?: string
 */
export async function POST(request: Request) {
    try {
        console.log('[History API] POST - Starting...');
        if (!isR2Configured()) {
            console.error('[History API] POST - R2 not configured');
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        // 从请求头或环境变量获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY || '';
        const userId = getUserIdFromApiKey(apiKey);
        console.log('[History API] POST - userId:', userId);

        const body = await request.json() as CreateHistoryRequestBody;
        const {
            imageData,
            thumbnailData,
            inputImageData,
            inputImageMimeType,
            inputImagesData,
            prompt,
            mode,
            model,
            aspectRatio,
        } = body;
        console.log('[History API] POST - prompt:', prompt, 'mode:', mode, 'model:', model);

        if (!imageData || !prompt) {
            console.error('[History API] POST - Missing params, imageData:', !!imageData, 'prompt:', !!prompt);
            return NextResponse.json({
                success: false,
                error: '缺少必要参数',
            }, { status: 400 });
        }

        // 生成唯一 ID
        const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // 上传图片到 R2（按用户存储）
        console.log('[History API] POST - Uploading image...');
        const imageKey = await uploadImage(imageData, id, userId);
        console.log('[History API] POST - Image uploaded, key:', imageKey);

        // 上传缩略图（如果有）
        if (thumbnailData) {
            try {
                await uploadThumbnail(thumbnailData, id, userId);
                console.log('[History API] POST - Thumbnail uploaded');
            } catch (err) {
                console.error('[History API] POST - Thumbnail upload failed:', err);
                // 缩略图上传失败不影响主流程
            }
        }

        // 图生图/扩图输入图按内容哈希去重存储（支持多图）
        const inputImageKeys: string[] = [];
        const inputImageHashes: string[] = [];
        if ((mode === 'img2img' || mode === 'outpaint')) {
            // 多图模式
            const imagesToUpload = inputImagesData && inputImagesData.length > 0
                ? inputImagesData
                : (inputImageData ? [inputImageData] : []);

            for (const imgData of imagesToUpload) {
                try {
                    const dedupResult = await uploadInputImageWithDedup(imgData, userId, inputImageMimeType || 'image/jpeg');
                    inputImageKeys.push(dedupResult.imageKey);
                    inputImageHashes.push(dedupResult.imageHash);
                } catch (err) {
                    console.error('[History API] POST - Input image store failed:', err);
                }
            }
            if (inputImageKeys.length > 0) {
                console.log('[History API] POST - Input images stored:', inputImageKeys.length);
            }
        }

        // 创建历史记录项
        const historyItem: HistoryItem = {
            id,
            timestamp: Date.now(),
            prompt,
            mode: mode || 'text2img',
            model: model || 'unknown',
            imageKey,
            aspectRatio,
            inputImageKey: inputImageKeys[0],
            inputImageHash: inputImageHashes[0],
            inputImageKeys: inputImageKeys.length > 0 ? inputImageKeys : undefined,
            inputImageHashes: inputImageHashes.length > 0 ? inputImageHashes : undefined,
        };

        // 保存到用户的历史记录
        console.log('[History API] POST - Saving history item...');
        const success = await addHistoryItem(userId, historyItem);
        console.log('[History API] POST - Save result:', success);

        if (success) {
            return NextResponse.json({
                success: true,
                item: {
                    ...historyItem,
                    imageUrl: getImageUrl(imageKey),
                    inputImageUrls: inputImageKeys.map(k => getImageUrl(k)),
                },
            });
        } else {
            return NextResponse.json({
                success: false,
                error: '保存历史记录失败',
            }, { status: 500 });
        }
    } catch (error: unknown) {
        console.error('[History API] POST error:', error);
        return NextResponse.json({
            success: false,
            error: getErrorMessage(error, '保存历史记录失败'),
        }, { status: 500 });
    }
}

/**
 * DELETE /api/history?id=xxx
 * 删除历史记录
 * 
 * Headers:
 * - x-api-key: 用户的 API Key（用于区分不同用户的历史记录）
 */
export async function DELETE(request: Request) {
    try {
        if (!isR2Configured()) {
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        // 从请求头或环境变量获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY || '';
        const userId = getUserIdFromApiKey(apiKey);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({
                success: false,
                error: '缺少记录 ID',
            }, { status: 400 });
        }

        const success = await deleteHistoryItem(userId, id);

        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({
                success: false,
                error: '删除失败',
            }, { status: 500 });
        }
    } catch (error: unknown) {
        console.error('[History API] DELETE error:', error);
        return NextResponse.json({
            success: false,
            error: getErrorMessage(error, '删除历史记录失败'),
        }, { status: 500 });
    }
}
