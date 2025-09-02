import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db'
import { users, registerUserSchema } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  console.log('🔍 Registration API called')
  
  try {
    // Check environment variables first
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL not set')
      return NextResponse.json(
        { success: false, message: 'Database configuration missing' },
        { status: 500 }
      )
    }

    if (!process.env.SUPABASE_URL) {
      console.error('❌ SUPABASE_URL not set')
      return NextResponse.json(
        { success: false, message: 'Supabase configuration missing' },
        { status: 500 }
      )
    }

    console.log('✅ Environment variables check passed')

    const body = await request.json()
    console.log('📝 Request body received:', { ...body, password: '[HIDDEN]' })
    
    // Validate input
    const validatedData = registerUserSchema.parse(body)
    console.log('✅ Input validation passed')
    
    const db = getDb()
    console.log('✅ Database connection established')
    
    // Test connection with a simple query
    try {
      await db.select().from(users).limit(1)
      console.log('✅ Database query test successful')
    } catch (dbError) {
      console.error('❌ Database query test failed:', dbError)
      throw new Error(`Database connection test failed: ${dbError.message}`)
    }
    
    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, validatedData.email))
      .limit(1)
    
    if (existingUser) {
      console.log('❌ User already exists:', validatedData.email)
      return NextResponse.json(
        { success: false, message: 'User with this email already exists' },
        { status: 400 }
      )
    }

    console.log('✅ Email is available')

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(validatedData.password, saltRounds)
    console.log('✅ Password hashed')

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: validatedData.email,
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        phone: validatedData.phone,
        role: validatedData.role,
        schoolId: validatedData.schoolId,
        businessRegNumber: validatedData.businessRegNumber,
        verifiedStatus: validatedData.role === 'agent' ? false : true, // Agents need verification
      })
      .returning()

    console.log('✅ User created successfully:', newUser.email)

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = newUser

    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
      message: 'Registration successful'
    }, { status: 201 })

  } catch (error) {
    console.error('❌ Registration error details:', error)
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      console.error('❌ Validation error:', error.issues)
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid input data',
          details: error.issues 
        },
        { status: 400 }
      )
    }

    // Handle database connection errors
    if (error.message?.includes('connect') || error.message?.includes('ENOTFOUND')) {
      console.error('❌ Database connection error')
      return NextResponse.json(
        { success: false, message: 'Database connection failed. Please check your DATABASE_URL.' },
        { status: 500 }
      )
    }

    // Handle database constraint errors
    if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      console.error('❌ Duplicate email error')
      return NextResponse.json(
        { success: false, message: 'Email already exists' },
        { status: 400 }
      )
    }

    // Handle missing table errors
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.error('❌ Database tables not found - SQL schema may not have been run')
      return NextResponse.json(
        { success: false, message: 'Database tables not found. Please run the SQL schema in Supabase first.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}