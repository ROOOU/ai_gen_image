import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, deductCredits } from '@/lib/auth';
import { generateImage, MODELSCOPE_MODELS } from '@/lib/modelscope';
import { uploadImages, isR2Configured } from '@/lib/r2';
import fs from 'fs';
import path from 'path';

// 历史记录存储路径
const HISTORY_DIR = path.join(process.cwd(), 'data', 'history');

// 确保目录存在
function ensureHistoryDir(userId: string) {
    const userDir = path.join(HISTORY_DIR, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
}

// 保存生成记录
function saveHistory(userId: string, record: any) {
    try {
        const userDir = ensureHistoryDir(userId);
        const historyFile = path.join(userDir, 'history.json');

        let history: any[] = [];
        if (fs.existsSync(historyFile)) {
            try {
                history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
            } catch (e) {
                history = [];
            }
        }

        history.unshift(record);

        // 只保留最近 100 条记录
        if (history.length > 100) {
            history = history.slice(0, 100);
        }

        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
        // 在 Vercel 环境中可能无法写入文件，忽略错误
        console.warn('[History] Failed to save history to file:', error);
    }
}

// 每次生成消耗的积分
const CREDITS_PER_GENERATION = 1;

export async function POST(request: Request) {
    try {
        // 验证用户登录
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: '请先登录', needLogin: true },
                { status: 401 }
            );
        }

        const userId = (session.user as any).id;

        // 解析请求
        const body = await request.json();
        const { prompt, model } = body;

        if (!prompt || prompt.trim() === '') {
            return NextResponse.json(
                { success: false, error: '请输入提示词' },
                { status: 400 }
            );
        }

        // 扣除积分
        const deducted = deductCredits(userId, CREDITS_PER_GENERATION);
        if (!deducted) {
            return NextResponse.json(
                { success: false, error: '积分不足，请充值后继续使用', needCredits: true },
                { status: 402 }
            );
        }

        // 使用 ModelScope 生成图片
        const modelId = model || MODELSCOPE_MODELS[0].id;
        console.log(`[Generate] 使用 ModelScope, 模型: ${modelId}`);

        const result = await generateImage(prompt.trim(), modelId);

        if (result.success && result.images) {
            // 上传图片到 R2（如果已配置）
            const genId = `gen_${Date.now()}`;
            let processedImages = result.images;

            if (isR2Configured()) {
                console.log('[Generate] Uploading images to R2...');
                processedImages = await uploadImages(
                    result.images,
                    `${userId}/${genId}`
                );
                console.log('[Generate] Images uploaded to R2');
            }

            // 保存历史记录
            saveHistory(userId, {
                id: genId,
                prompt: prompt.trim(),
                images: processedImages,
                text: result.text,
                model: modelId,
                provider: 'modelscope',
                mode: 'text2img',
                createdAt: new Date().toISOString()
            });

            return NextResponse.json({
                success: true,
                images: processedImages,
                text: result.text
            });
        } else {
            // 生成失败
            return NextResponse.json(
                { success: false, error: result.error || '生成失败' },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('生成失败:', error);
        return NextResponse.json(
            { success: false, error: error.message || '服务器错误' },
            { status: 500 }
        );
    }
}
