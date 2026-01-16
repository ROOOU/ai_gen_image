import { NextResponse } from 'next/server';
import { createUser, findUserByEmail } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const { email, username, password } = await request.json();

        // 验证输入
        if (!email || !username || !password) {
            return NextResponse.json(
                { error: '请填写所有字段' },
                { status: 400 }
            );
        }

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: '请输入有效的邮箱地址' },
                { status: 400 }
            );
        }

        // 验证密码长度
        if (password.length < 6) {
            return NextResponse.json(
                { error: '密码至少需要6个字符' },
                { status: 400 }
            );
        }

        // 检查邮箱是否已存在
        const existingUser = findUserByEmail(email);
        if (existingUser) {
            return NextResponse.json(
                { error: '该邮箱已被注册' },
                { status: 400 }
            );
        }

        // 创建用户
        const user = await createUser(email, username, password);

        return NextResponse.json({
            success: true,
            message: '注册成功！您获得了 100 积分作为新用户礼物',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                credits: user.credits
            }
        });

    } catch (error: any) {
        console.error('注册失败:', error);
        return NextResponse.json(
            { error: error.message || '注册失败，请稍后重试' },
            { status: 500 }
        );
    }
}
