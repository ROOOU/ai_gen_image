import { NextResponse } from 'next/server';
import { checkStatus, loadConfig } from '@/lib/modelscope';

export async function GET() {
    try {
        const status = await checkStatus();
        const config = loadConfig();

        return NextResponse.json({
            ...status,
            config: {
                baseUrl: config.baseUrl,
                provider: 'modelscope'
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            configured: false,
            valid: false,
            message: `检查状态失败: ${error.message}`
        });
    }
}
