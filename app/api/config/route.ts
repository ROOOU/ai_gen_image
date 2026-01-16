import { NextRequest, NextResponse } from 'next/server';
import { saveConfig, loadConfig } from '@/lib/modelscope';

// 获取配置
export async function GET() {
    try {
        const config = loadConfig();
        return NextResponse.json({
            success: true,
            config: {
                baseUrl: config.baseUrl,
                provider: 'modelscope'
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// 更新配置
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { baseUrl, apiKey } = body;

        const updates: Record<string, string> = {};
        if (baseUrl) updates.baseUrl = baseUrl;
        if (apiKey) updates.apiKey = apiKey;

        saveConfig(updates);
        const newConfig = loadConfig();

        return NextResponse.json({
            success: true,
            config: {
                baseUrl: newConfig.baseUrl,
                provider: 'modelscope'
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
