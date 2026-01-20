import { NextResponse } from 'next/server';

// 游客免费试用次数限制
const GUEST_FREE_LIMIT = 5;

// 游客使用记录（与 generate/route.ts 共享）
// 注意：在 Vercel 无服务器环境中，不同的 API 路由可能运行在不同的实例上
// 所以游客次数可能不会完全准确，但对于试用功能来说是可接受的
// 生产环境如需精确控制，可以用 Redis 或数据库
const guestUsageMap = new Map<string, { count: number; lastUsed: number }>();

/**
 * GET /api/guest?guestId=xxx
 * 获取游客剩余免费试用次数
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');

    if (!guestId) {
        return NextResponse.json({
            success: true,
            remaining: GUEST_FREE_LIMIT,
            limit: GUEST_FREE_LIMIT,
            used: 0
        });
    }

    const usage = guestUsageMap.get(guestId);
    const count = usage?.count || 0;

    return NextResponse.json({
        success: true,
        remaining: Math.max(0, GUEST_FREE_LIMIT - count),
        limit: GUEST_FREE_LIMIT,
        used: count
    });
}
