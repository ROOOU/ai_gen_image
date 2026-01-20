import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { isR2Configured, loadUsersFromR2, saveUsersToR2, UserData } from './r2';

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL === '1';

// 用户数据存储路径（本地开发）
const USERS_PATH = path.join(process.cwd(), 'data', 'users.json');

// 内存缓存（用于减少 R2 请求）
let memoryUsers: User[] = [];
let memoryInitialized = false;
let lastR2Sync = 0;
const R2_SYNC_INTERVAL = 30000; // 30秒同步一次

// 确保数据目录存在（仅本地开发）
function ensureDataDir() {
    if (isVercel) return;
    try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (error) {
        console.warn('[Auth] Cannot create data directory:', error);
    }
}

// 用户类型
interface User {
    id: string;
    email: string;
    username: string;
    password: string;
    avatar?: string;
    credits: number;
    createdAt: string;
    provider?: string; // 'credentials' | 'google' | etc.
    providerId?: string; // OAuth provider's user ID
}

// 演示用户数据
const DEMO_USER: User = {
    id: 'demo_user_1',
    email: 'demo@example.com',
    username: 'Demo User',
    password: '$2a$10$rQnM1v.4X5F5l5yF5l5yFuOaKqKqKqKqKqKqKqKqKqKqKqKqKq', // demo123456
    credits: 100,
    createdAt: new Date().toISOString()
};

/**
 * 从 R2 同步用户数据到内存
 */
async function syncUsersFromR2(): Promise<void> {
    if (!isR2Configured()) return;

    const now = Date.now();
    // 如果距离上次同步不到 30 秒，跳过
    if (memoryInitialized && (now - lastR2Sync) < R2_SYNC_INTERVAL) {
        return;
    }

    try {
        const r2Users = await loadUsersFromR2();
        if (r2Users.length > 0) {
            memoryUsers = r2Users as User[];
            console.log(`[Auth] Synced ${r2Users.length} users from R2`);
        } else if (!memoryInitialized) {
            // 首次加载且 R2 无数据，初始化演示用户
            memoryUsers = [DEMO_USER];
            // 保存演示用户到 R2
            await saveUsersToR2(memoryUsers as UserData[]);
            console.log('[Auth] Initialized demo user in R2');
        }
        memoryInitialized = true;
        lastR2Sync = now;
    } catch (error) {
        console.error('[Auth] Failed to sync from R2:', error);
        if (!memoryInitialized) {
            memoryUsers = [DEMO_USER];
            memoryInitialized = true;
        }
    }
}

/**
 * 加载用户数据
 * - Vercel 环境: 优先从 R2 加载，回退到内存缓存
 * - 本地开发: 从文件加载
 */
export function loadUsers(): User[] {
    if (isVercel) {
        // Vercel 环境：使用内存缓存（异步同步在后台进行）
        if (!memoryInitialized) {
            // 首次访问，返回演示用户
            memoryUsers = [DEMO_USER];
            memoryInitialized = true;
            // 触发异步同步（不阻塞）
            void syncUsersFromR2();
        }
        return memoryUsers;
    }

    // 本地开发使用文件存储
    ensureDataDir();
    try {
        if (fs.existsSync(USERS_PATH)) {
            const data = fs.readFileSync(USERS_PATH, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('加载用户数据失败:', error);
    }
    return [];
}

/**
 * 异步加载用户数据（推荐在 API 路由中使用）
 */
export async function loadUsersAsync(): Promise<User[]> {
    if (isVercel && isR2Configured()) {
        await syncUsersFromR2();
        return memoryUsers;
    }
    return loadUsers();
}

// 用户查询缓存
let cachedUsers: User[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000;

function getCachedUsers(): User[] {
    const now = Date.now();
    if (!cachedUsers || (now - cacheTimestamp) > CACHE_TTL) {
        cachedUsers = loadUsers();
        cacheTimestamp = now;
    }
    return cachedUsers;
}

function invalidateUserCache() {
    cachedUsers = null;
    cacheTimestamp = 0;
}

/**
 * 保存用户数据
 */
export function saveUsers(users: User[]) {
    // 清除缓存
    invalidateUserCache();

    if (isVercel) {
        // Vercel 环境：保存到内存并异步同步到 R2
        memoryUsers = users;

        if (isR2Configured()) {
            // 异步保存到 R2（不阻塞）
            void saveUsersToR2(users as UserData[]).then(success => {
                if (success) {
                    lastR2Sync = Date.now();
                }
            });
        }
        return;
    }

    // 本地开发保存到文件
    ensureDataDir();
    try {
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('[Auth] Failed to save users:', error);
    }
}

/**
 * 异步保存用户数据（推荐使用）
 */
export async function saveUsersAsync(users: User[]): Promise<void> {
    invalidateUserCache();
    memoryUsers = users;

    if (isVercel && isR2Configured()) {
        await saveUsersToR2(users as UserData[]);
        lastR2Sync = Date.now();
    } else if (!isVercel) {
        ensureDataDir();
        try {
            fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
        } catch (error) {
            console.error('[Auth] Failed to save users:', error);
        }
    }
}

// 通过邮箱查找用户
export function findUserByEmail(email: string): User | undefined {
    const users = getCachedUsers();
    return users.find(u => u.email === email);
}

// 异步通过邮箱查找用户
export async function findUserByEmailAsync(email: string): Promise<User | undefined> {
    const users = await loadUsersAsync();
    return users.find(u => u.email === email);
}

// 通过ID查找用户
export function findUserById(id: string): User | undefined {
    const users = getCachedUsers();
    return users.find(u => u.id === id);
}

// 异步通过ID查找用户
export async function findUserByIdAsync(id: string): Promise<User | undefined> {
    const users = await loadUsersAsync();
    return users.find(u => u.id === id);
}

// 创建新用户
export async function createUser(email: string, username: string, password: string): Promise<User> {
    // 使用异步加载确保获取最新数据
    const users = await loadUsersAsync();

    // 检查邮箱是否已存在
    if (users.find(u => u.email === email)) {
        throw new Error('该邮箱已注册');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        username,
        password: hashedPassword,
        credits: 100, // 新用户赠送 100 积分
        createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // 使用异步保存确保数据持久化
    await saveUsersAsync(users);

    console.log(`[Auth] Created new user: ${email}, credits: 100`);

    return newUser;
}

// 创建或查找 OAuth 用户（Google 等）
export async function findOrCreateOAuthUser(
    email: string,
    name: string,
    provider: string,
    providerId: string,
    avatar?: string
): Promise<User> {
    const users = await loadUsersAsync();

    // 先通过 provider + providerId 查找
    let user = users.find(u => u.provider === provider && u.providerId === providerId);

    if (user) {
        // 更新用户名和头像（如果有变化）
        if (user.username !== name || user.avatar !== avatar) {
            user.username = name;
            user.avatar = avatar;
            await saveUsersAsync(users);
        }
        return user;
    }

    // 再通过邮箱查找（可能是先用邮箱注册，后用 Google 登录）
    user = users.find(u => u.email === email);

    if (user) {
        // 关联 OAuth 信息
        user.provider = provider;
        user.providerId = providerId;
        if (avatar) user.avatar = avatar;
        await saveUsersAsync(users);
        console.log(`[Auth] Linked OAuth to existing user: ${email}`);
        return user;
    }

    // 创建新 OAuth 用户
    const newUser: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        username: name,
        password: '', // OAuth 用户不需要密码
        avatar,
        credits: 100,
        createdAt: new Date().toISOString(),
        provider,
        providerId
    };

    users.push(newUser);
    await saveUsersAsync(users);

    console.log(`[Auth] Created new OAuth user: ${email}, provider: ${provider}, credits: 100`);

    return newUser;
}

// 验证用户密码
export async function verifyPassword(user: User, password: string): Promise<boolean> {
    // 演示用户特殊处理
    if (user.id === 'demo_user_1' && password === 'demo123456') {
        return true;
    }
    return await bcrypt.compare(password, user.password);
}

// 更新用户积分
export async function updateUserCredits(userId: string, credits: number): Promise<boolean> {
    const users = await loadUsersAsync();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return false;

    users[userIndex].credits = credits;
    await saveUsersAsync(users);
    return true;
}

// 扣除用户积分
export function deductCredits(userId: string, amount: number): boolean {
    const users = loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return false;
    if (users[userIndex].credits < amount) return false;

    users[userIndex].credits -= amount;
    saveUsers(users);
    return true;
}

// 异步扣除用户积分（更可靠）
export async function deductCreditsAsync(userId: string, amount: number): Promise<boolean> {
    const users = await loadUsersAsync();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return false;
    if (users[userIndex].credits < amount) return false;

    users[userIndex].credits -= amount;
    await saveUsersAsync(users);
    return true;
}

// NextAuth 配置
export const authOptions: NextAuthOptions = {
    providers: [
        // 邮箱密码登录
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: '邮箱', type: 'email' },
                password: { label: '密码', type: 'password' }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('请输入邮箱和密码');
                }

                // 使用异步查找确保获取最新用户数据
                const user = await findUserByEmailAsync(credentials.email);

                if (!user) {
                    throw new Error('邮箱或密码错误');
                }

                const isValid = await verifyPassword(user, credentials.password);

                if (!isValid) {
                    throw new Error('邮箱或密码错误');
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.username,
                    image: user.avatar
                };
            }
        }),
        // Google OAuth 登录（仅在配置了环境变量时启用）
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
            GoogleProvider({
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                authorization: {
                    params: {
                        prompt: "consent",
                        access_type: "offline",
                        response_type: "code"
                    }
                }
            })
        ] : [])
    ],
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 天
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            // 处理 OAuth 登录
            if (account?.provider === 'google' && user.email) {
                try {
                    // 创建或查找 OAuth 用户
                    await findOrCreateOAuthUser(
                        user.email,
                        user.name || user.email.split('@')[0],
                        'google',
                        account.providerAccountId,
                        user.image || undefined
                    );
                    return true;
                } catch (error) {
                    console.error('[Auth] OAuth signIn error:', error);
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user, account }) {
            if (user) {
                // 对于 OAuth 登录，需要查找我们系统中的用户 ID
                if (account?.provider === 'google' && user.email) {
                    const dbUser = await findUserByEmailAsync(user.email);
                    if (dbUser) {
                        token.id = dbUser.id;
                    }
                } else {
                    token.id = user.id;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                (session.user as any).id = token.id;

                // 获取最新的用户积分
                const user = await findUserByIdAsync(token.id as string);
                if (user) {
                    (session.user as any).credits = user.credits;
                }
            }
            return session;
        }
    },
    pages: {
        signIn: '/',
    },
    secret: process.env.NEXTAUTH_SECRET || 'nanophoto-ai-secret-key-2024',
};
