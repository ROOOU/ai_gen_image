import { NextResponse } from 'next/server';
import { uploadImage, isR2Configured } from '@/lib/r2';

export async function GET() {
    // 检查 R2 环境变量配置
    const config = {
        CLOUDFLARE_ACCOUNT_ID: !!process.env.CLOUDFLARE_ACCOUNT_ID,
        R2_BUCKET_NAME: !!process.env.R2_BUCKET_NAME,
        R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
        R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '(not set)',
        // 显示部分值用于调试
        accountIdPrefix: process.env.CLOUDFLARE_ACCOUNT_ID?.substring(0, 8) + '...',
        bucketName: process.env.R2_BUCKET_NAME
    };

    console.log('[Debug] R2 Config Check:', config);

    // 测试 R2 上传
    let uploadResult = null;
    let uploadError = null;

    if (isR2Configured()) {
        try {
            // 创建一个小的测试图片 (1x1 红色像素 PNG)
            const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
            const testFilename = `test_${Date.now()}`;

            console.log('[Debug] Testing R2 upload...');
            uploadResult = await uploadImage(testImage, testFilename);
            console.log('[Debug] R2 upload result:', uploadResult);
        } catch (error: any) {
            uploadError = error.message;
            console.error('[Debug] R2 upload error:', error);
        }
    }

    return NextResponse.json({
        success: true,
        r2Configured: isR2Configured(),
        config,
        uploadTest: {
            attempted: isR2Configured(),
            result: uploadResult,
            error: uploadError
        }
    });
}
