import { NextResponse } from 'next/server';
import {
    isR2Configured,
    loadHistory,
    addHistoryItem,
    deleteHistoryItem,
    uploadImage,
    getImageUrl,
    getUserIdFromApiKey,
    HistoryItem,
} from '@/lib/r2';

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

        // 从请求头获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || '';
        const userId = getUserIdFromApiKey(apiKey);
        console.log('[History API] GET - userId:', userId, 'apiKey length:', apiKey.length);

        const history = await loadHistory(userId);
        console.log('[History API] GET - Loaded history items:', history.length);

        // 为每个记录添加图片 URL
        const historyWithUrls = history.map(item => ({
            ...item,
            imageUrl: getImageUrl(item.imageKey),
        }));

        return NextResponse.json({
            success: true,
            history: historyWithUrls,
        });
    } catch (error: any) {
        console.error('[History API] GET error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '获取历史记录失败',
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

        // 从请求头获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || '';
        const userId = getUserIdFromApiKey(apiKey);
        console.log('[History API] POST - userId:', userId);

        const body = await request.json();
        const { imageData, prompt, mode, model, aspectRatio } = body;
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

        // 创建历史记录项
        const historyItem: HistoryItem = {
            id,
            timestamp: Date.now(),
            prompt,
            mode: mode || 'text2img',
            model: model || 'unknown',
            imageKey,
            aspectRatio,
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
                },
            });
        } else {
            return NextResponse.json({
                success: false,
                error: '保存历史记录失败',
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error('[History API] POST error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '保存历史记录失败',
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

        // 从请求头获取 API Key，生成用户 ID
        const apiKey = request.headers.get('x-api-key') || '';
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
    } catch (error: any) {
        console.error('[History API] DELETE error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '删除历史记录失败',
        }, { status: 500 });
    }
}
