const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

async function main() {
  const prisma = new PrismaClient();
  const email = 'admin@can-go.local';
  const password = 'password123';
  const phone = '+15550000001';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      role: 'ADMIN',
      isSuspended: false,
    },
    create: {
      email,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log(`admin ready: ${email} / ${password}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
