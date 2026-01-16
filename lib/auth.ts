import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL === '1';

// 用户数据存储路径
const USERS_PATH = path.join(process.cwd(), 'data', 'users.json');

// 内存存储（用于 Vercel 环境）
// 注意：每次函数冷启动会重置，但同一实例内会保持
let memoryUsers: User[] = [];
let memoryInitialized = false;

// 确保数据目录存在（仅本地开发）
function ensureDataDir() {
    if (isVercel) return; // Vercel 环境跳过
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
}

// 初始化演示用户（用于 Vercel 环境）
async function initDemoUsers() {
    if (memoryInitialized) return;
    memoryInitialized = true;

    // 创建一个演示用户
    const demoPassword = await bcrypt.hash('demo123456', 10);
    memoryUsers = [
        {
            id: 'demo_user_1',
            email: 'demo@example.com',
            username: 'Demo User',
            password: demoPassword,
            credits: 100,
            createdAt: new Date().toISOString()
        }
    ];
    console.log('[Auth] Demo user initialized for Vercel environment');
}

// 加载用户数据
export function loadUsers(): User[] {
    if (isVercel) {
        // Vercel 环境使用内存存储
        if (!memoryInitialized) {
            // 同步初始化（简化处理）
            const demoPasswordHash = '$2a$10$demo.hash.for.demo123456'; // 预计算的 hash
            memoryUsers = [
                {
                    id: 'demo_user_1',
                    email: 'demo@example.com',
                    username: 'Demo User',
                    password: demoPasswordHash,
                    credits: 100,
                    createdAt: new Date().toISOString()
                }
            ];
            memoryInitialized = true;
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

// 保存用户数据
export function saveUsers(users: User[]) {
    if (isVercel) {
        // Vercel 环境保存到内存
        memoryUsers = users;
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

// 通过邮箱查找用户
export function findUserByEmail(email: string): User | undefined {
    const users = loadUsers();
    return users.find(u => u.email === email);
}

// 通过ID查找用户
export function findUserById(id: string): User | undefined {
    const users = loadUsers();
    return users.find(u => u.id === id);
}

// 创建新用户
export async function createUser(email: string, username: string, password: string): Promise<User> {
    const users = loadUsers();

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
    saveUsers(users);

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
export function updateUserCredits(userId: string, credits: number): boolean {
    const users = loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return false;

    users[userIndex].credits = credits;
    saveUsers(users);
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

// NextAuth 配置
export const authOptions: NextAuthOptions = {
    providers: [
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

                const user = findUserByEmail(credentials.email);

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
        })
    ],
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 天
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                (session.user as any).id = token.id;

                // 获取最新的用户积分
                const user = findUserById(token.id as string);
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
