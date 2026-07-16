import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // --- App login user ---
  const email = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "changeme123";
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hash },
  });
  console.log(`✓ App user: ${email} (password from SEED_USER_PASSWORD)`);

  // --- Settings singleton ---
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  console.log("✓ Settings singleton");

  // --- Sample templates ---
  const templates = [
    {
      name: "Friendly intro note",
      type: "connection_note",
      body: "Hi {{firstName}}, I came across your profile and would love to connect — always great to meet people in the {{company}} space.",
    },
    {
      name: "Mutual interest note",
      type: "connection_note",
      body: "Hi {{firstName}}, your work as {{title}} caught my eye. Would be great to connect!",
    },
    {
      name: "Follow-up message",
      type: "message",
      body: "Thanks for connecting, {{firstName}}! I'm curious about what you're working on at {{company}}. Open to a quick chat sometime?",
    },
    {
      name: "Value-add message",
      type: "message",
      body: "Hi {{firstName}}, glad we connected. We help teams like {{company}} streamline their workflow — happy to share a few ideas if useful.",
    },
  ];

  for (const t of templates) {
    const existing = await prisma.template.findFirst({
      where: { name: t.name },
    });
    if (!existing) await prisma.template.create({ data: t });
  }
  console.log(`✓ ${templates.length} sample templates`);

  console.log("\nSeed complete. Log in with the credentials above.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
