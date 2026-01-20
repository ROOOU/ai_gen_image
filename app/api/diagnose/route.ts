import { NextResponse } from 'next/server';
import { uploadImage, isR2Configured, loadHistoryFromR2, saveHistoryToR2 } from '@/lib/r2';

/**
 * 诊断端点 - 测试 R2 上传和历史记录功能
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, userId, base64Image } = body;

        const results: Record<string, any> = {
            r2Configured: isR2Configured(),
        };

        if (action === 'test-upload' && base64Image) {
            // 测试上传 base64 图片到 R2
            const testKey = `test/diag_${Date.now()}`;
            const uploadedUrl = await uploadImage(base64Image, testKey);
            results.uploadTest = {
                success: !!uploadedUrl,
                url: uploadedUrl,
            };
        }

        if (action === 'test-history' && userId) {
            // 测试加载历史记录
            const history = await loadHistoryFromR2(userId);
            results.historyTest = {
                count: history.length,
                latest: history[0] || null,
            };
        }

        if (action === 'test-save-history' && userId) {
            // 测试保存历史记录
            const testRecord = {
                id: `test_${Date.now()}`,
                prompt: 'Diagnostic test',
                images: [{ url: 'https://example.com/test.png', title: 'Test' }],
                model: 'test-model',
                provider: 'test',
                mode: 'text2img',
                createdAt: new Date().toISOString(),
            };

            let history = await loadHistoryFromR2(userId);
            history.unshift(testRecord);
            if (history.length > 100) {
                history = history.slice(0, 100);
            }
            await saveHistoryToR2(userId, history);

            // 验证保存成功
            const verifyHistory = await loadHistoryFromR2(userId);
            results.saveHistoryTest = {
                success: verifyHistory.length > 0 && verifyHistory[0]?.id === testRecord.id,
                count: verifyHistory.length,
            };
        }

        return NextResponse.json({
            success: true,
            results,
        });

    } catch (error: any) {
        console.error('[Diagnose] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack?.substring(0, 500),
        }, { status: 500 });
    }
}
