import { NextResponse } from 'next/server';
import { MODELSCOPE_MODELS } from '@/lib/modelscope';

// 模型提供商类型
export interface ModelProvider {
    id: string;
    name: string;
    models: Array<{
        id: string;
        name: string;
        description?: string;
        supportsTextToImage?: boolean;
        supportsImageToImage?: boolean;
    }>;
}

export async function GET() {
    try {
        // 只返回 ModelScope 模型列表
        const providers: ModelProvider[] = [
            {
                id: 'modelscope',
                name: '魔塔 ModelScope',
                models: MODELSCOPE_MODELS.map(m => ({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    supportsTextToImage: (m as any).supportsTextToImage ?? true,
                    supportsImageToImage: (m as any).supportsImageToImage ?? false
                }))
            }
        ];

        return NextResponse.json({
            success: true,
            providers
        });

    } catch (error: any) {
        console.error('获取模型列表失败:', error);
        return NextResponse.json(
            { success: false, error: error.message || '获取模型列表失败' },
            { status: 500 }
        );
    }
}
