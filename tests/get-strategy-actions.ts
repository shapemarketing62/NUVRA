import { prisma } from "../lib/prisma";

async function main() {
  const businessId = "cmsuzna6v000ovd1cz4e3yrcm";

  const strategy = await prisma.strategy.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: { actions: { orderBy: { order: "asc" } } },
  });

  console.log("STRATEGY_ACTIONS_COUNT=" + (strategy?.actions?.length ?? 0));
  console.log("STRATEGY_ACTIONS=" + JSON.stringify(strategy?.actions, null, 2));

  const questions = await prisma.clarificationQuestion.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });

  console.log("QUESTIONS_COUNT=" + questions.length);
  console.log("QUESTIONS=" + JSON.stringify(questions, null, 2));
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
