import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken } from '@/lib/auth/jwt';

const INIT_ADMIN_PASS = process.env.INIT_ADMIN_PASS;

export async function GET() {
  // Lightweight check used by the /create-admin page to know if setup is allowed
  const userCount = await prisma.user.count();
  return NextResponse.json({ hasUsers: userCount > 0 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, initAdminPass } = body;

    if (!email || !password || !initAdminPass) {
      return NextResponse.json(
        { error: 'Email, password and initial admin password are required' },
        { status: 400 },
      );
    }

    if (!INIT_ADMIN_PASS) {
      console.error('INIT_ADMIN_PASS is not configured in environment');
      return NextResponse.json(
        { error: 'Application is not configured correctly. Please contact an administrator.' },
        { status: 500 },
      );
    }

    // Only allow admin creation when there are no users yet
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Admin user already created.' },
        { status: 403 },
      );
    }

    if (initAdminPass !== INIT_ADMIN_PASS) {
      return NextResponse.json(
        { error: 'Invalid initial admin password.' },
        { status: 403 },
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'HR_Admin',
      },
    });

    const token = signToken(user.id, user.role);

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Create admin error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}


