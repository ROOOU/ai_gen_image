import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/modelscope';

/**
 * 测试 ModelScope API 连接的调试端点
 * 仅用于排障，生产环境应移除
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { model, prompt, image_url } = body;

        const config = loadConfig();

        const headers = {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'X-ModelScope-Async-Mode': 'true'
        };

        const requestBody: Record<string, any> = {
            model: model || 'Tongyi-MAI/Z-Image-Turbo',
            prompt: prompt || 'a cute cat'
        };

        if (image_url) {
            requestBody.image_url = Array.isArray(image_url) ? image_url : [image_url];
        }

        console.log('[Test] Sending to ModelScope:', JSON.stringify(requestBody, null, 2));

        const submitResponse = await fetch(`${config.baseUrl}v1/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        const responseText = await submitResponse.text();

        return NextResponse.json({
            success: submitResponse.ok,
            status: submitResponse.status,
            statusText: submitResponse.statusText,
            request: {
                model: requestBody.model,
                prompt: requestBody.prompt,
                hasImageUrl: !!requestBody.image_url,
                imageUrlPreview: requestBody.image_url ? requestBody.image_url[0]?.substring(0, 100) + '...' : null
            },
            response: responseText
        });

    } catch (error: any) {
        console.error('[Test] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
