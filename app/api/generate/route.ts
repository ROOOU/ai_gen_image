import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, deductCreditsAsync } from '@/lib/auth';
import { MODELSCOPE_MODELS, loadConfig } from '@/lib/modelscope';
import { uploadImage, isR2Configured } from '@/lib/r2';

// 每次生成消耗的积分
const CREDITS_PER_GENERATION = 1;

// 游客免费试用次数限制
const GUEST_FREE_LIMIT = 5;

// 游客使用记录（内存存储，重启会重置）
// 生产环境可以考虑用 Redis 或 R2 持久化
const guestUsageMap = new Map<string, { count: number; lastUsed: number }>();

// 清理过期的游客记录（24小时后）
function cleanupGuestUsage() {
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000; // 24小时
    for (const [guestId, usage] of guestUsageMap.entries()) {
        if (now - usage.lastUsed > expireTime) {
            guestUsageMap.delete(guestId);
        }
    }
}

// 检查游客使用次数
function checkGuestUsage(guestId: string): { allowed: boolean; remaining: number } {
    cleanupGuestUsage();
    const usage = guestUsageMap.get(guestId);
    const count = usage?.count || 0;
    return {
        allowed: count < GUEST_FREE_LIMIT,
        remaining: Math.max(0, GUEST_FREE_LIMIT - count)
    };
}

// 记录游客使用
function recordGuestUsage(guestId: string): number {
    const usage = guestUsageMap.get(guestId) || { count: 0, lastUsed: 0 };
    usage.count += 1;
    usage.lastUsed = Date.now();
    guestUsageMap.set(guestId, usage);
    return GUEST_FREE_LIMIT - usage.count;
}

/**
 * 提交生成任务 - 非阻塞模式
 * 立即返回 task_id，客户端轮询 /api/generate/status 获取结果
 * 支持游客模式：未登录用户可免费试用5次
 */
export async function POST(request: Request) {
    try {
        const sessionPromise = getServerSession(authOptions);
        const bodyPromise = request.json();

        const session = await sessionPromise;
        const body = await bodyPromise;
        let { prompt, model, image_url, images, guestId } = body;

        // 判断是否为游客模式
        const isGuest = !session?.user;
        let userId: string;

        if (isGuest) {
            // 游客模式：检查是否有 guestId
            if (!guestId) {
                return NextResponse.json(
                    { success: false, error: '请先登录或使用游客模式', needLogin: true },
                    { status: 401 }
                );
            }

            // 检查游客使用次数
            const { allowed, remaining } = checkGuestUsage(guestId);
            if (!allowed) {
                return NextResponse.json(
                    {
                        success: false,
                        error: '游客免费试用次数已用完，请登录获取更多积分',
                        needLogin: true,
                        guestLimitReached: true
                    },
                    { status: 402 }
                );
            }

            userId = `guest_${guestId}`;
            console.log(`[Generate] Guest mode: ${guestId}, remaining: ${remaining}`);
        } else {
            userId = (session.user as any).id;
        }

        // 兼容前端传入的 images 数组
        if (!image_url && images && Array.isArray(images) && images.length > 0) {
            const imageData = images[0].data || images[0].url || images[0];

            if (imageData && typeof imageData === 'string' && imageData.startsWith('data:')) {
                console.log('[Generate] Detected base64 image, uploading to R2 first...');

                if (isR2Configured()) {
                    const uploadedUrl = await uploadImage(imageData, `input/${userId}/img_${Date.now()}`);
                    if (uploadedUrl) {
                        image_url = uploadedUrl;
                        console.log('[Generate] Image uploaded to R2:', image_url);
                    } else {
                        return NextResponse.json(
                            { success: false, error: '图片上传失败，请重试' },
                            { status: 500 }
                        );
                    }
                } else {
                    return NextResponse.json(
                        { success: false, error: '服务配置错误，无法处理图片' },
                        { status: 500 }
                    );
                }
            } else if (imageData && typeof imageData === 'string' && imageData.startsWith('http')) {
                image_url = imageData;
            }
        }

        if (!prompt || prompt.trim() === '') {
            return NextResponse.json(
                { success: false, error: '请输入提示词' },
                { status: 400 }
            );
        }

        // 积分/游客次数处理
        let guestRemaining: number | undefined;

        if (isGuest) {
            // 游客模式：记录使用次数
            guestRemaining = recordGuestUsage(guestId);
            console.log(`[Generate] Guest ${guestId} used, remaining: ${guestRemaining}`);
        } else {
            // 登录用户：扣除积分
            const deducted = await deductCreditsAsync(userId, CREDITS_PER_GENERATION);
            if (!deducted) {
                return NextResponse.json(
                    { success: false, error: '积分不足，请充值后继续使用', needCredits: true },
                    { status: 402 }
                );
            }
        }

        const modelId = model || MODELSCOPE_MODELS[0].id;
        const config = loadConfig();

        // 构建请求体
        const requestBody: Record<string, any> = {
            model: modelId,
            prompt: prompt.trim()
        };

        if (image_url) {
            requestBody.image_url = Array.isArray(image_url) ? image_url : [image_url];
        }

        console.log('[Generate] Submitting task:', JSON.stringify({
            model: modelId,
            prompt: prompt.trim(),
            hasImageUrl: !!image_url
        }));

        // 提交生成任务
        const submitResponse = await fetch(`${config.baseUrl}v1/images/generations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                'X-ModelScope-Async-Mode': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            console.error('[Generate] Submit failed:', errorText);
            return NextResponse.json(
                { success: false, error: `提交任务失败: ${errorText}` },
                { status: 500 }
            );
        }

        const submitData = await submitResponse.json();
        const taskId = submitData.task_id;

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: '未获取到任务 ID' },
                { status: 500 }
            );
        }

        // 立即返回 task_id，让客户端轮询状态
        return NextResponse.json({
            success: true,
            taskId: taskId,
            status: 'PENDING',
            message: '任务已提交，请轮询 /api/generate/status?taskId=' + taskId,
            isGuest: isGuest,
            guestRemaining: guestRemaining
        });

    } catch (error: any) {
        console.error('生成失败:', error);
        return NextResponse.json(
            { success: false, error: error.message || '服务器错误' },
            { status: 500 }
        );
    }
}
