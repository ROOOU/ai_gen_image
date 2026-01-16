import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, deductCredits } from '@/lib/auth';
import { generateImage, MODELSCOPE_MODELS } from '@/lib/modelscope';
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
        // 如果没有指定模型，使用默认模型
        const modelId = model || MODELSCOPE_MODELS[0].id;
        console.log(`[Generate] 使用 ModelScope, 模型: ${modelId}`);

        const result = await generateImage(prompt.trim(), modelId);

        if (result.success) {
            // 保存历史记录
            saveHistory(userId, {
                id: `gen_${Date.now()}`,
                prompt: prompt.trim(),
                images: result.images,
                text: result.text,
                model: modelId,
                provider: 'modelscope',
                mode: 'text2img',
                createdAt: new Date().toISOString()
            });

            return NextResponse.json({
                success: true,
                images: result.images,
                text: result.text
            });
        } else {
            // 生成失败，可以考虑返还积分
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
