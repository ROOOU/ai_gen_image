/**
 * ModelScope (魔塔) API Client
 * 支持魔塔平台的图像生成模型
 * 
 * 文档: https://modelscope.cn/docs
 */

import fs from 'fs';
import path from 'path';

// 配置接口
export interface ModelScopeConfig {
    baseUrl: string;
    apiKey: string;
}

// 默认配置
const DEFAULT_CONFIG: ModelScopeConfig = {
    baseUrl: 'https://api-inference.modelscope.cn/',
    apiKey: 'ms-5afddfc5-3a00-403f-be60-fab5c360dae9'
};

// 配置文件路径
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// 可用的魔塔图像生成模型
export const MODELSCOPE_MODELS = [
    {
        id: 'Tongyi-MAI/Z-Image-Turbo',
        name: 'Z-Image Turbo',
        description: '通义万相快速图像生成模型'
    },
    {
        id: 'AI-ModelScope/stable-diffusion-xl-base-1.0',
        name: 'SDXL 1.0',
        description: 'Stable Diffusion XL 基础模型'
    },
    {
        id: 'AI-ModelScope/stable-diffusion-3-medium',
        name: 'SD3 Medium',
        description: 'Stable Diffusion 3 中型模型'
    }
];

// 加载配置 - 优先使用环境变量
export function loadConfig(): ModelScopeConfig {
    // 优先从环境变量读取
    const envConfig: ModelScopeConfig = {
        baseUrl: process.env.MODELSCOPE_BASE_URL || DEFAULT_CONFIG.baseUrl,
        apiKey: process.env.MODELSCOPE_API_KEY || DEFAULT_CONFIG.apiKey
    };

    // 如果环境变量已配置，直接返回
    if (process.env.MODELSCOPE_API_KEY) {
        return envConfig;
    }

    // 否则尝试从配置文件读取（本地开发）
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
            const saved = JSON.parse(data);
            return {
                baseUrl: saved.modelscope?.baseUrl || envConfig.baseUrl,
                apiKey: saved.modelscope?.apiKey || envConfig.apiKey
            };
        }
    } catch (error) {
        console.error('加载 ModelScope 配置失败:', error);
    }
    return envConfig;
}

// 保存配置
export function saveConfig(config: Partial<ModelScopeConfig>): void {
    try {
        let existing: Record<string, any> = {};
        if (fs.existsSync(CONFIG_PATH)) {
            existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
        existing.modelscope = {
            ...DEFAULT_CONFIG,
            ...existing.modelscope,
            ...config
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2));
    } catch (error) {
        console.error('保存 ModelScope 配置失败:', error);
    }
}

// 生成结果接口
export interface GenerateResult {
    success: boolean;
    images?: Array<{
        url: string;
        base64?: string;
        title?: string;
    }>;
    text?: string;
    error?: string;
}

/**
 * 生成图片
 */
export async function generateImage(
    prompt: string,
    modelId: string = 'Tongyi-MAI/Z-Image-Turbo',
    options?: {
        loras?: string | Record<string, number>;
        negativePrompt?: string;
        width?: number;
        height?: number;
    }
): Promise<GenerateResult> {
    const config = loadConfig();

    const headers = {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Async-Mode': 'true'
    };

    try {
        // 1. 提交生成任务
        const requestBody: Record<string, any> = {
            model: modelId,
            prompt: prompt
        };

        if (options?.loras) {
            requestBody.loras = options.loras;
        }
        if (options?.negativePrompt) {
            requestBody.negative_prompt = options.negativePrompt;
        }
        if (options?.width) {
            requestBody.width = options.width;
        }
        if (options?.height) {
            requestBody.height = options.height;
        }

        console.log('[ModelScope] 提交生成任务:', { model: modelId, prompt });

        const submitResponse = await fetch(`${config.baseUrl}v1/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            console.error('[ModelScope] 提交任务失败:', errorText);
            return {
                success: false,
                error: `提交任务失败: ${submitResponse.status} - ${errorText}`
            };
        }

        const submitData = await submitResponse.json();
        const taskId = submitData.task_id;

        if (!taskId) {
            return {
                success: false,
                error: '未获取到任务 ID'
            };
        }

        console.log('[ModelScope] 任务已提交, taskId:', taskId);

        // 2. 轮询检查任务状态
        const maxPolls = 60; // 最多轮询 60 次
        const pollInterval = 2000; // 每 2 秒轮询一次

        for (let i = 0; i < maxPolls; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            const statusResponse = await fetch(`${config.baseUrl}v1/tasks/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-ModelScope-Task-Type': 'image_generation'
                }
            });

            if (!statusResponse.ok) {
                console.error('[ModelScope] 查询任务状态失败:', statusResponse.status);
                continue;
            }

            const statusData = await statusResponse.json();
            console.log('[ModelScope] 任务状态:', statusData.task_status);

            if (statusData.task_status === 'SUCCEED') {
                // 获取生成的图片
                const imageUrls = statusData.output_images || [];

                if (imageUrls.length === 0) {
                    return {
                        success: false,
                        error: '生成成功但未返回图片'
                    };
                }

                // 下载图片并转换为 base64
                const images: Array<{ url: string; base64?: string; title?: string }> = [];

                for (let j = 0; j < imageUrls.length; j++) {
                    const imgUrl = imageUrls[j];
                    try {
                        // 下载图片
                        const imgResponse = await fetch(imgUrl);
                        if (imgResponse.ok) {
                            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                            const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                            images.push({
                                url: base64,
                                base64: base64,
                                title: `Generated Image ${j + 1}`
                            });
                        } else {
                            // 如果下载失败，直接使用 URL
                            images.push({
                                url: imgUrl,
                                title: `Generated Image ${j + 1}`
                            });
                        }
                    } catch (imgError) {
                        console.error('[ModelScope] 下载图片失败:', imgError);
                        images.push({
                            url: imgUrl,
                            title: `Generated Image ${j + 1}`
                        });
                    }
                }

                return {
                    success: true,
                    images,
                    text: `使用 ${modelId} 生成`
                };

            } else if (statusData.task_status === 'FAILED') {
                return {
                    success: false,
                    error: statusData.error_message || '图像生成失败'
                };
            }

            // 任务仍在进行中，继续轮询
        }

        return {
            success: false,
            error: '生成超时，请稍后重试'
        };

    } catch (error: any) {
        console.error('[ModelScope] 生成失败:', error);
        return {
            success: false,
            error: error.message || '生成失败'
        };
    }
}

/**
 * 检查服务状态
 */
export async function checkStatus(): Promise<{
    configured: boolean;
    valid: boolean;
    message: string;
}> {
    const config = loadConfig();

    try {
        // 发送一个简单的请求来测试连接
        const response = await fetch(`${config.baseUrl}v1/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            return {
                configured: true,
                valid: true,
                message: 'ModelScope 连接正常'
            };
        }

        return {
            configured: true,
            valid: false,
            message: `连接失败: ${response.status}`
        };

    } catch (error: any) {
        if (error.name === 'TimeoutError') {
            return {
                configured: true,
                valid: false,
                message: '连接超时'
            };
        }

        return {
            configured: true,
            valid: false,
            message: `连接失败: ${error.message}`
        };
    }
}

/**
 * 获取可用模型列表
 */
export function getAvailableModels() {
    return MODELSCOPE_MODELS;
}
