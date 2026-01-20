import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadHistoryFromR2, saveHistoryToR2 } from '@/lib/r2';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ history: [], loggedIn: false });
        }

        const userId = (session.user as any).id;

        // 从 R2 加载历史记录
        const history = await loadHistoryFromR2(userId);

        return NextResponse.json({
            history,
            loggedIn: true
        });

    } catch (error) {
        console.error('获取历史记录失败:', error);
        return NextResponse.json({ history: [], error: '获取失败' });
    }
}

// 删除历史记录
export async function DELETE(request: Request) {
    try {
        // Vercel best practice: async-api-routes
        // 尽早启动 Promise，延迟 await
        const sessionPromise = getServerSession(authOptions);
        const bodyPromise = request.json();

        const session = await sessionPromise;

        if (!session?.user) {
            return NextResponse.json(
                { error: '请先登录' },
                { status: 401 }
            );
        }

        const userId = (session.user as any).id;

        // 并行执行：解析请求体和加载历史记录
        // Vercel best practice: async-parallel
        const [body, existingHistory] = await Promise.all([
            bodyPromise,
            loadHistoryFromR2(userId)
        ]);

        const { id } = body;
        let history = existingHistory;

        if (id) {
            // 删除单条记录
            history = history.filter((item) => item.id !== id);
        } else {
            // 清空所有记录
            history = [];
        }

        // 保存到 R2
        await saveHistoryToR2(userId, history);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('删除历史记录失败:', error);
        return NextResponse.json(
            { error: '删除失败' },
            { status: 500 }
        );
    }
}

