import { NextResponse } from 'next/server';
import {
    isR2Configured,
    loadHistory,
    addHistoryItem,
    deleteHistoryItem,
    uploadImage,
    getImageUrl,
    HistoryItem,
} from '@/lib/r2';

/**
 * GET /api/history
 * 获取历史记录列表
 */
export async function GET() {
    try {
        if (!isR2Configured()) {
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        const history = await loadHistory();

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
 * Body:
 * - imageData: string (base64 data URL)
 * - prompt: string
 * - mode: 'text2img' | 'img2img' | 'outpaint'
 * - model: string
 * - aspectRatio?: string
 */
export async function POST(request: Request) {
    try {
        if (!isR2Configured()) {
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        const body = await request.json();
        const { imageData, prompt, mode, model, aspectRatio } = body;

        if (!imageData || !prompt) {
            return NextResponse.json({
                success: false,
                error: '缺少必要参数',
            }, { status: 400 });
        }

        // 生成唯一 ID
        const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // 上传图片到 R2
        const imageKey = await uploadImage(imageData, id);

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

        // 保存到历史
        const success = await addHistoryItem(historyItem);

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
 */
export async function DELETE(request: Request) {
    try {
        if (!isR2Configured()) {
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({
                success: false,
                error: '缺少记录 ID',
            }, { status: 400 });
        }

        const success = await deleteHistoryItem(id);

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
