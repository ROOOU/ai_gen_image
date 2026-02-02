import { NextResponse } from 'next/server';
import { getImage, isR2Configured } from '@/lib/r2';

/**
 * GET /api/history/image?key=xxx
 * 代理获取 R2 图片
 */
export async function GET(request: Request) {
    try {
        if (!isR2Configured()) {
            return NextResponse.json({
                success: false,
                error: 'R2 存储未配置',
            }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (!key) {
            return NextResponse.json({
                success: false,
                error: '缺少图片 key',
            }, { status: 400 });
        }

        const imageBuffer = await getImage(key);

        if (!imageBuffer) {
            return NextResponse.json({
                success: false,
                error: '图片不存在',
            }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(imageBuffer), {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error: any) {
        console.error('[Image API] GET error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '获取图片失败',
        }, { status: 500 });
    }
}
