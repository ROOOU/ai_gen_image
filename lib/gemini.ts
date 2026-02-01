/**
 * Gemini Nano Banana API Client
 * 
 * 支持 Nano Banana (gemini-2.5-flash-image) 和 Nano Banana Pro (gemini-3-pro-image-preview)
 * 
 * 文档: https://ai.google.dev/gemini-api/docs/image-generation
 */

import { GoogleGenAI } from '@google/genai';

// 可用模型
export const GEMINI_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Nano Banana',
    description: '快速高效，适合批量生成',
    supports4K: false,
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Nano Banana Pro',
    description: '专业级质量，支持高分辨率和复杂指令',
    supports4K: true,
  },
];

// 可用比例
export const ASPECT_RATIOS = [
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
];

// 可用分辨率（仅 Nano Banana Pro）
export const RESOLUTIONS = [
  { id: '1K', name: '1K' },
  { id: '2K', name: '2K' },
  { id: '4K', name: '4K' },
];

// 生成配置接口
export interface GenerateConfig {
  model: string;
  aspectRatio?: string;
  imageSize?: string; // 仅 gemini-3-pro-image-preview 支持
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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: 'test',
      config: {
        responseModalities: ['TEXT'],
      },
    });
    
    return {
      success: true,
      message: 'API Key 验证成功',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'API Key 验证失败',
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

    const generateConfig: Record<string, any> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    // 设置图片配置
    if (config.aspectRatio || config.imageSize) {
      generateConfig.imageConfig = {};
      if (config.aspectRatio) {
        generateConfig.imageConfig.aspectRatio = config.aspectRatio;
      }
      // 仅 gemini-3-pro-image-preview 支持 imageSize
      if (config.imageSize && config.model === 'gemini-3-pro-image-preview') {
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
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          text += part.text;
        } else if (part.inlineData) {
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
  } catch (error: any) {
    console.error('[Gemini] 生成失败:', error);
    return {
      success: false,
      error: error.message || '生成失败',
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
    const contents: Array<any> = [
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

    const generateConfig: Record<string, any> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    // 设置图片配置
    if (config.aspectRatio || config.imageSize) {
      generateConfig.imageConfig = {};
      if (config.aspectRatio) {
        generateConfig.imageConfig.aspectRatio = config.aspectRatio;
      }
      if (config.imageSize && config.model === 'gemini-3-pro-image-preview') {
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
  } catch (error: any) {
    console.error('[Gemini] 编辑失败:', error);
    return {
      success: false,
      error: error.message || '编辑失败',
    };
  }
}
