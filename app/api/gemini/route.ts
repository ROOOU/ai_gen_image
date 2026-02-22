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

        const body = await request.json();
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

        // 构建生成配置
        const generateConfig: Record<string, any> = {
            responseModalities: ['TEXT', 'IMAGE'],
        };

        // 设置图片配置
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
            // 图生图/扩图模式
            generateConfig.imageConfig = {};

            // 如果指定了比例（非 auto），则应用
            if (aspectRatio) {
                generateConfig.imageConfig.aspectRatio = aspectRatio;
            }

            // Pro 模型使用用户选择的分辨率
            if (model === 'gemini-3-pro-image-preview' && imageSize) {
                generateConfig.imageConfig.imageSize = imageSize;
            }
        }

        // 构建内容
        let contents: any;

        if (mode === 'outpaint' && hasInputImages && images.length >= 2) {
            // 扩图模式：使用特殊的 prompt 结构和图像顺序
            // 第一张图：composite（画布+原图）
            // 第二张图：mask（黑色=保留，白色=生成）

            const compositeBase64 = images[0].data.replace(/^data:[^;]+;base64,/, '');
            const maskBase64 = images[1].data.replace(/^data:[^;]+;base64,/, '');

            // 构建扩图专用内容
            contents = [
                // 先发送 mask 作为参考（白色区域是要生成的）
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: maskBase64,
                    },
                },
                // 再发送 composite（包含原图的画布）
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: compositeBase64,
                    },
                },
                // 最后发送提示词
                {
                    text: `${prompt}. Expand this image to fill the canvas, seamlessly extending the content. Match the original style, lighting, and perspective. The white areas in the mask indicate where new content should be generated.`,
                },
            ];

            console.log('[Gemini API] Outpainting mode:', {
                model,
                promptLength: prompt.length,
                compositeSize: compositeBase64.length,
                maskSize: maskBase64.length,
                aspectRatio,
            });
        } else if (hasInputImages) {
            // 普通图生图模式
            contents = [{ text: prompt }];

            for (const img of images) {
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
        const apiKey = request.headers.get('x-api-key') || process.env.GEMINI_API_KEY;

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
