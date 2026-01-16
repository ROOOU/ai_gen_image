import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// 用户数据存储路径
const USERS_PATH = path.join(process.cwd(), 'data', 'users.json');

// 确保数据目录存在
function ensureDataDir() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
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

// 加载用户数据
export function loadUsers(): User[] {
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
    ensureDataDir();
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
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
