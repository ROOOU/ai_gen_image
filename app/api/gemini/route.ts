import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

type GenerateMode = 'text2img' | 'img2img' | 'outpaint';

interface InputImage {
    data: string;
    mimeType?: string;
}

interface GenerateRequestBody {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
    images?: InputImage[];
    mode?: GenerateMode;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

/**
 * POST /api/gemini
 * 
 * 图片生成 API
 * 
 * 请求体:
 * - prompt: string - 提示词
 * - model: string - 模型 ID
 * - aspectRatio?: string - 图片比例
 * - imageSize?: string - 分辨率（仅 gemini-3-pro-image-preview）
 * - images?: Array<{ data: string, mimeType: string }> - 参考图片（图生图/扩图模式）
 * - mode?: 'text2img' | 'img2img' | 'outpaint' - 生成模式
 * 
 * 请求头:
 * - x-api-key: string - Google AI Studio API Key
 */
export async function POST(request: Request) {
    try {
        // 从请求头或环境变量获取 API Key
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: '请先设置 API Key' },
                { status: 401 }
            );
        }

        const body = await request.json() as GenerateRequestBody;
        const { prompt, model, aspectRatio, imageSize, images, mode = 'text2img' } = body;

        if (!prompt || prompt.trim() === '') {
            return NextResponse.json(
                { success: false, error: '请输入提示词' },
                { status: 400 }
            );
        }

        if (!model) {
            return NextResponse.json(
                { success: false, error: '请选择模型' },
                { status: 400 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        // 检查是否有输入图片（图生图/扩图模式）
        const hasInputImages = images && Array.isArray(images) && images.length > 0;

        // Pro 模型最大输入图片数量限制
        const maxImages = 14;

        if (hasInputImages && mode === 'img2img' && images!.length > maxImages) {
            return NextResponse.json(
                { success: false, error: `当前模型最多支持 ${maxImages} 张参考图片，请删减后重试` },
                { status: 400 }
            );
        }

        if ((mode === 'img2img' || mode === 'outpaint') && !hasInputImages) {
            return NextResponse.json(
                { success: false, error: `${mode === 'img2img' ? '图生图' : '扩图'}模式需要提供输入图片` },
                { status: 400 }
            );
        }

        // 构建生成配置
        const generateConfig: { responseModalities: string[]; imageConfig?: { aspectRatio?: string; imageSize?: string } } = {
            responseModalities: ['TEXT', 'IMAGE'],
        };

        // 设置图片配置（仅文生图模式支持 imageConfig，图生图/扩图模式不支持任何 imageConfig 参数）
        if (!hasInputImages) {
            const imageConfigParams: { aspectRatio?: string; imageSize?: string } = {};
            if (aspectRatio) imageConfigParams.aspectRatio = aspectRatio;
            if (imageSize) imageConfigParams.imageSize = imageSize;
            if (Object.keys(imageConfigParams).length > 0) {
                generateConfig.imageConfig = imageConfigParams;
            }
        }
        // 图生图/扩图模式：不传任何 imageConfig，Gemini 编辑 API 不支持该参数

        // 构建内容
        let contents: string | Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;

        if (mode === 'outpaint' && hasInputImages) {
            // 扩图模式：发送合成图（原图已放在画布上）给 Gemini
            // Gemini 会理解画面构图并生成扩展内容
            const compositeBase64 = images[0].data.replace(/^data:[^;]+;base64,/, '');

            contents = [
                {
                    text: prompt,
                },
                {
                    inlineData: {
                        mimeType: images[0].mimeType || 'image/jpeg',
                        data: compositeBase64,
                    },
                },
            ];

            console.log('[Gemini API] Outpainting mode:', {
                model,
                promptLength: prompt.length,
                compositeImageSize: compositeBase64.length,
            });
        } else if (hasInputImages) {
            // 普通图生图模式
            contents = [{ text: prompt }];

            for (const img of images!) {
                const base64Data = img.data.replace(/^data:[^;]+;base64,/, '');
                contents.push({
                    inlineData: {
                        mimeType: img.mimeType || 'image/png',
                        data: base64Data,
                    },
                });
            }
        } else {
            // 文生图模式
            contents = prompt;
        }

        console.log('[Gemini API] Generating with:', {
            model,
            mode,
            promptLength: prompt.length,
            imageCount: images?.length || 0,
            config: generateConfig.imageConfig || 'none',
        });

        const response = await ai.models.generateContent({
            model,
            contents,
            config: generateConfig,
        });

        const resultImages: Array<{ data: string; mimeType: string }> = [];
        let text = '';

        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.text) {
                    text += part.text;
                } else if (part.inlineData) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    resultImages.push({
                        data: `data:${mimeType};base64,${part.inlineData.data}`,
                        mimeType,
                    });
                }
            }
        }

        if (resultImages.length === 0) {
            return NextResponse.json({
                success: false,
                error: '未能生成图片，请尝试修改提示词',
                text,
            });
        }

        return NextResponse.json({
            success: true,
            images: resultImages,
            text,
        });

    } catch (error: unknown) {
        console.error('[Gemini API] Error:', error);

        // 提取友好的错误信息
        let errorMessage = getErrorMessage(error, '生成失败');

        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
            errorMessage = 'API Key 无效，请检查后重试';
        } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
            errorMessage = 'API 配额已用尽，请稍后重试';
        } else if (errorMessage.includes('SAFETY')) {
            errorMessage = '内容被安全策略拦截，请修改提示词';
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}

/**
 * GET /api/gemini
 * 
 * 测试 API Key 连接
 */
export async function GET(request: Request) {
    try {
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: '请提供 API Key' },
                { status: 401 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        // 发送一个简单的文本请求来验证 API Key
        await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: 'Say "OK" if you can read this.',
            config: {
                responseModalities: ['TEXT'],
            },
        });

        return NextResponse.json({
            success: true,
            message: 'API Key 验证成功',
        });

    } catch (error: unknown) {
        console.error('[Gemini API] Test error:', error);

        let errorMessage = getErrorMessage(error, '验证失败');

        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
            errorMessage = 'API Key 无效';
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 401 }
        );
    }
}
