import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// 历史记录存储路径
const HISTORY_DIR = path.join(process.cwd(), 'data', 'history');

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ history: [], loggedIn: false });
        }

        const userId = (session.user as any).id;
        const historyFile = path.join(HISTORY_DIR, userId, 'history.json');

        if (!fs.existsSync(historyFile)) {
            return NextResponse.json({ history: [], loggedIn: true });
        }

        const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

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
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { error: '请先登录' },
                { status: 401 }
            );
        }

        const userId = (session.user as any).id;
        const { id } = await request.json();

        const historyFile = path.join(HISTORY_DIR, userId, 'history.json');

        if (!fs.existsSync(historyFile)) {
            return NextResponse.json({ success: true });
        }

        let history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

        if (id) {
            // 删除单条记录
            history = history.filter((item: any) => item.id !== id);
        } else {
            // 清空所有记录
            history = [];
        }

        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('删除历史记录失败:', error);
        return NextResponse.json(
            { error: '删除失败' },
            { status: 500 }
        );
    }
}
