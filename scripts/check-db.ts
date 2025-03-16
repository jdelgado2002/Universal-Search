import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    // Check database connection
    await prisma.$connect()
    console.log('✓ Database connection successful')

    // Check tables
    const users = await prisma.user.count()
    console.log(`✓ Users table exists (${users} records)`)

    const tokens = await prisma.token.count()
    console.log(`✓ Tokens table exists (${tokens} records)`)

    const connections = await prisma.userConnection.count()
    console.log(`✓ UserConnections table exists (${connections} records)`)

    // Sample query
    const recentConnections = await prisma.userConnection.findMany({
      where: { isConnected: true },
      include: { user: true },
      take: 5,
      orderBy: { lastConnected: 'desc' }
    })

    console.log('\nRecent connections:')
    console.table(recentConnections.map(conn => ({
      userId: conn.userId,
      email: conn.user.email,
      provider: conn.provider,
      connected: conn.isConnected,
      lastConnected: conn.lastConnected
    })))

  } catch (error) {
    console.error('Database check failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
