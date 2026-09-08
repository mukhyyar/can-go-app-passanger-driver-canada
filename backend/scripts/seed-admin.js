const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

async function main() {
  const email = process.argv[2];
  const phone = process.argv[3];
  const password = process.argv[4] || 'password123';
  const roleSlug = process.argv[5] || 'super-admin';
  if (!email || !phone) {
    console.error('Usage: node seed-admin.js <email> <phoneE164> [password] [roleSlug]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const adminRole = await prisma.adminRole.findUnique({ where: { slug: roleSlug } });
  const isSuper = roleSlug === 'super-admin';
  const role = isSuper ? 'SUPER_ADMIN' : 'ADMIN';
  const u = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      role,
      adminRoleId: adminRole?.id ?? undefined,
      isSuspended: false,
    },
    create: {
      email,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      passwordHash,
      role,
      adminRoleId: adminRole?.id ?? undefined,
    },
  });
  console.log(JSON.stringify({ id: u.id, email: u.email, role: u.role, adminRole: roleSlug }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
