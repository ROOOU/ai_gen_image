import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadConfig } from '@/lib/modelscope';
import { uploadImage, isR2Configured, loadHistoryFromR2, saveHistoryToR2 } from '@/lib/r2';

/**
 * 查询生成任务状态
 * 客户端轮询此 API 获取生成结果
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: '请先登录', needLogin: true },
                { status: 401 }
            );
        }

        const userId = (session.user as any).id;
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get('taskId');
        const prompt = searchParams.get('prompt') || '';
        const model = searchParams.get('model') || '';

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: '缺少 taskId 参数' },
                { status: 400 }
            );
        }

        const config = loadConfig();

        // 查询任务状态
        const statusResponse = await fetch(`${config.baseUrl}v1/tasks/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                'X-ModelScope-Task-Type': 'image_generation'
            }
        });

        if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error('[Status] Query failed:', errorText);
            return NextResponse.json(
                { success: false, error: `查询任务状态失败: ${errorText}` },
                { status: 500 }
            );
        }

        const statusData = await statusResponse.json();
        console.log('[Status] Task status:', statusData.task_status);

        if (statusData.task_status === 'SUCCEED') {
            // 任务完成，获取图片
            const imageUrls = statusData.output_images || [];

            if (imageUrls.length === 0) {
                return NextResponse.json({
                    success: false,
                    status: 'FAILED',
                    error: '生成成功但未返回图片'
                });
            }

            // 下载图片并上传到 R2
            const processedImages: Array<{ url: string; base64?: string; title?: string }> = [];

            for (let i = 0; i < imageUrls.length; i++) {
                const imgUrl = imageUrls[i];
                try {
                    // 下载图片
                    const imgResponse = await fetch(imgUrl);
                    if (imgResponse.ok) {
                        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                        const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;

                        // 上传到 R2
                        if (isR2Configured()) {
                            const r2Url = await uploadImage(base64, `output/${userId}/gen_${Date.now()}_${i}`);
                            if (r2Url) {
                                processedImages.push({
                                    url: r2Url,
                                    base64: base64,
                                    title: `Generated Image ${i + 1}`
                                });
                            } else {
                                processedImages.push({
                                    url: base64,
                                    base64: base64,
                                    title: `Generated Image ${i + 1}`
                                });
                            }
                        } else {
                            processedImages.push({
                                url: base64,
                                base64: base64,
                                title: `Generated Image ${i + 1}`
                            });
                        }
                    } else {
                        processedImages.push({
                            url: imgUrl,
                            title: `Generated Image ${i + 1}`
                        });
                    }
                } catch (imgError) {
                    console.error('[Status] Download image failed:', imgError);
                    processedImages.push({
                        url: imgUrl,
                        title: `Generated Image ${i + 1}`
                    });
                }
            }

            // 保存到历史记录（阻塞等待完成，确保在函数返回前保存成功）
            const genId = `gen_${Date.now()}`;
            const historyRecord = {
                id: genId,
                prompt: prompt,
                images: processedImages,
                text: `使用 ${model} 生成`,
                model: model,
                provider: 'modelscope',
                mode: 'text2img',
                createdAt: new Date().toISOString()
            };

            try {
                let history = await loadHistoryFromR2(userId);
                history.unshift(historyRecord);
                if (history.length > 100) {
                    history = history.slice(0, 100);
                }
                const saveResult = await saveHistoryToR2(userId, history);
                console.log('[Status] History save result:', saveResult, 'for user:', userId);
            } catch (historyError) {
                console.error('[Status] History save error:', historyError);
            }

            return NextResponse.json({
                success: true,
                status: 'SUCCEED',
                images: processedImages,
                timeTaken: statusData.time_taken
            });

        } else if (statusData.task_status === 'FAILED') {
            return NextResponse.json({
                success: false,
                status: 'FAILED',
                error: statusData.error_message || '图像生成失败'
            });

        } else {
            // PENDING 或 PROCESSING
            return NextResponse.json({
                success: true,
                status: statusData.task_status,
                message: statusData.task_status === 'PROCESSING' ? '正在生成中...' : '等待处理中...'
            });
        }

    } catch (error: any) {
        console.error('查询任务状态失败:', error);
        return NextResponse.json(
            { success: false, error: error.message || '服务器错误' },
            { status: 500 }
        );
    }
}
