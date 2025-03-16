import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    await prisma.$connect()
    console.log('✓ Database connection successful')

    // Detailed user query
    const users = await prisma.user.findMany({
      include: {
        accounts: true,
        connections: true
      }
    })

    console.log('\nUsers:')
    console.table(users.map(user => ({
      id: user.id,
      email: user.email,
      accountCount: user.accounts.length,
      connectionCount: user.connections.length
    })))

    // Show all connections with user details
    const connections = await prisma.userConnection.findMany({
      include: {
        user: {
          include: {
            accounts: true
          }
        }
      }
    })

    console.log('\nConnections with User Details:')
    console.table(connections.map(conn => ({
      connectionId: conn.id,
      userId: conn.userId,
      userEmail: conn.user.email,
      provider: conn.provider,
      connected: conn.isConnected,
      lastConnected: conn.lastConnected,
      hasAccount: conn.user.accounts.length > 0
    })))

    console.log('\ntokens:')
    const tokens = await prisma.token.findMany({
      include: {
        user: true
      }
    })
    console.table(tokens.map(token => ({
      tokenId: token.id,
      userId: token.userId,
      provider: token.provider,
      accessToken: token.accessToken.trim().substring(0, 20) + '...',
      expiresAt: token.expiresAt,
      userEmail: token.user.email
    })))
  } catch (error) {
    console.error('Database check failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
