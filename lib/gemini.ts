/**
 * Gemini Nano Banana API Client
 * 
 * 支持 Nano Banana 2 (gemini-3.1-flash-image-preview) 和 Nano Banana Pro (gemini-3-pro-image-preview)
 * 
 * 文档: https://ai.google.dev/gemini-api/docs/image-generation
 */

import { GoogleGenAI } from '@google/genai';

interface GeminiInlineData {
  mimeType?: string;
  data?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// 可用模型（第一个为默认模型）
export const GEMINI_MODELS = [
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Nano Banana 2',
    description: '性价比最佳，速度快，支持高分辨率',
    supports4K: true,
    maxImages: 14,
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Nano Banana Pro',
    description: '专业级质量，Thinking 模式，支持复杂指令',
    supports4K: true,
    maxImages: 14,
  },
];

// 可用比例
export const ASPECT_RATIOS = [
  { id: 'auto', name: '自适应' },
  { id: '1:1', name: '1:1 (方形)' },
  { id: '2:3', name: '2:3 (竖版)' },
  { id: '3:2', name: '3:2 (横版)' },
  { id: '3:4', name: '3:4 (竖版)' },
  { id: '4:3', name: '4:3 (横版)' },
  { id: '4:5', name: '4:5 (竖版)' },
  { id: '5:4', name: '5:4 (横版)' },
  { id: '9:16', name: '9:16 (手机竖屏)' },
  { id: '16:9', name: '16:9 (宽屏)' },
  { id: '21:9', name: '21:9 (超宽屏)' },
  // Nano Banana 2 独有
  { id: '4:1', name: '4:1 (超宽)' },
  { id: '1:4', name: '1:4 (超长)' },
  { id: '8:1', name: '8:1 (全景)' },
  { id: '1:8', name: '1:8 (极长)' },
];

// 可用分辨率（Nano Banana 2 和 Nano Banana Pro 均支持）
export const RESOLUTIONS = [
  { id: '512px', name: '512px' }, // 仅 Nano Banana 2
  { id: '1K', name: '1K' },
  { id: '2K', name: '2K' },
  { id: '4K', name: '4K' },
];

// 生成配置接口
export interface GenerateConfig {
  model: string;
  aspectRatio?: string;
  imageSize?: string; // gemini-3-pro-image-preview 和 gemini-3.1-flash-image-preview 均支持
}

// 生成结果接口
export interface GenerateResult {
  success: boolean;
  images?: Array<{
    data: string; // base64 data URL
    mimeType: string;
  }>;
  text?: string;
  error?: string;
}

// 上传的图片接口
export interface UploadedImage {
  data: string; // base64 data URL
  mimeType: string;
}

/**
 * 创建 Gemini 客户端
 */
export function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/**
 * 测试 API Key 连接
 */
export async function testConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    // 尝试列出模型来验证 API Key
    await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: 'test',
      config: {
        responseModalities: ['TEXT'],
      },
    });

    return {
      success: true,
      message: 'API Key 验证成功',
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, 'API Key 验证失败'),
    };
  }
}

/**
 * 文生图 - 根据提示词生成图片
 */
export async function generateImage(
  apiKey: string,
  prompt: string,
  config: GenerateConfig
): Promise<GenerateResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const generateConfig: {
      responseModalities: string[];
      imageConfig?: { aspectRatio?: string; imageSize?: string };
    } = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    // 设置图片配置
    if (config.aspectRatio || config.imageSize) {
      generateConfig.imageConfig = {};
      if (config.aspectRatio) {
        generateConfig.imageConfig.aspectRatio = config.aspectRatio;
      }
      // gemini-3-pro-image-preview 和 gemini-3.1-flash-image-preview 均支持 imageSize
      if (config.imageSize && (config.model === 'gemini-3-pro-image-preview' || config.model === 'gemini-3.1-flash-image-preview')) {
        generateConfig.imageConfig.imageSize = config.imageSize;
      }
    }

    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: generateConfig,
    });

    const images: Array<{ data: string; mimeType: string }> = [];
    let text = '';

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts as GeminiPart[]) {
        if (part.text) {
          text += part.text;
        } else if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          images.push({
            data: `data:${mimeType};base64,${part.inlineData.data}`,
            mimeType,
          });
        }
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        error: '未能生成图片',
        text,
      };
    }

    return {
      success: true,
      images,
      text,
    };
  } catch (error: unknown) {
    console.error('[Gemini] 生成失败:', error);
    return {
      success: false,
      error: getErrorMessage(error, '生成失败'),
    };
  }
}

/**
 * 图生图 - 根据参考图片和提示词编辑图片
 */
export async function editImage(
  apiKey: string,
  prompt: string,
  images: UploadedImage[],
  config: GenerateConfig
): Promise<GenerateResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    // 构建内容数组：文本 + 图片
    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];

    // 添加参考图片
    for (const img of images) {
      // 从 data URL 提取 base64 数据
      const base64Data = img.data.replace(/^data:[^;]+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: base64Data,
        },
      });
    }

    const generateConfig: {
      responseModalities: string[];
      imageConfig?: { aspectRatio?: string; imageSize?: string };
    } = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    // 设置图片配置
    if (config.aspectRatio || config.imageSize) {
      generateConfig.imageConfig = {};
      if (config.aspectRatio) {
        generateConfig.imageConfig.aspectRatio = config.aspectRatio;
      }
      if (config.imageSize && (config.model === 'gemini-3-pro-image-preview' || config.model === 'gemini-3.1-flash-image-preview')) {
        generateConfig.imageConfig.imageSize = config.imageSize;
      }
    }

    const response = await ai.models.generateContent({
      model: config.model,
      contents,
      config: generateConfig,
    });

    const resultImages: Array<{ data: string; mimeType: string }> = [];
    let text = '';

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts as GeminiPart[]) {
        if (part.text) {
          text += part.text;
        } else if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          resultImages.push({
            data: `data:${mimeType};base64,${part.inlineData.data}`,
            mimeType,
          });
        }
      }
    }

    if (resultImages.length === 0) {
      return {
        success: false,
        error: '未能生成图片',
        text,
      };
    }

    return {
      success: true,
      images: resultImages,
      text,
    };
  } catch (error: unknown) {
    console.error('[Gemini] 编辑失败:', error);
    return {
      success: false,
      error: getErrorMessage(error, '编辑失败'),
    };
  }
}
