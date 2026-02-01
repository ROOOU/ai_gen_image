import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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
 * - images?: Array<{ data: string, mimeType: string }> - 参考图片（图生图模式）
 * 
 * 请求头:
 * - x-api-key: string - Google AI Studio API Key
 */
export async function POST(request: Request) {
    try {
        // 从请求头获取 API Key
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: '请先设置 API Key' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { prompt, model, aspectRatio, imageSize, images } = body;

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

        // 构建生成配置
        const generateConfig: Record<string, any> = {
            responseModalities: ['TEXT', 'IMAGE'],
        };

        // 设置图片配置
        // 注意：当有输入图片时，API 会自动匹配输入图片的尺寸
        // 所以只有纯文生图模式才设置 aspectRatio
        if (!hasInputImages) {
            // 纯文生图模式：使用 aspectRatio 和 imageSize
            if (aspectRatio || imageSize) {
                generateConfig.imageConfig = {};
                if (aspectRatio) {
                    generateConfig.imageConfig.aspectRatio = aspectRatio;
                }
                if (imageSize && model === 'gemini-3-pro-image-preview') {
                    generateConfig.imageConfig.imageSize = imageSize;
                }
            }
        } else {
            // 图生图/扩图模式：不设 aspectRatio，让 API 匹配输入尺寸
            // 对于 Pro 模型，启用最高分辨率以确保输出质量
            if (model === 'gemini-3-pro-image-preview') {
                generateConfig.imageConfig = {
                    imageSize: '4K', // 确保高分辨率输出
                };
            }
        }

        // 构建内容
        let contents: any;

        if (images && Array.isArray(images) && images.length > 0) {
            // 图生图模式
            contents = [{ text: prompt }];

            for (const img of images) {
                // 从 data URL 提取 base64 数据
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
            mode: hasInputImages ? 'img2img/outpaint' : 'text2img',
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

    } catch (error: any) {
        console.error('[Gemini API] Error:', error);

        // 提取友好的错误信息
        let errorMessage = error.message || '生成失败';

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
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: '请提供 API Key' },
                { status: 401 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        // 发送一个简单的文本请求来验证 API Key
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: 'Say "OK" if you can read this.',
            config: {
                responseModalities: ['TEXT'],
            },
        });

        return NextResponse.json({
            success: true,
            message: 'API Key 验证成功',
        });

    } catch (error: any) {
        console.error('[Gemini API] Test error:', error);

        let errorMessage = error.message || '验证失败';

        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
            errorMessage = 'API Key 无效';
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 401 }
        );
    }
}
