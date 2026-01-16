import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, findUserById } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ credits: 0, loggedIn: false });
        }

        const userId = (session.user as any).id;
        const user = findUserById(userId);

        if (!user) {
            return NextResponse.json({ credits: 0, loggedIn: false });
        }

        return NextResponse.json({
            credits: user.credits,
            loggedIn: true,
            username: user.username
        });

    } catch (error) {
        console.error('获取积分失败:', error);
        return NextResponse.json({ credits: 0, loggedIn: false });
    }
}
