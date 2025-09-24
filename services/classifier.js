const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Returns true if OpenAI thinks this is a common repeatable FAQ
 * (pricing, plans, features, company, general trading, etc.)
 */
async function isCommonQuestion(question, answer) {
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content:
        "You are a classifier. Decide if the user's question is likely to be repeated by many users (a FAQ) about the product or trading in general. Respond only with 'yes' or 'no'." },
      { role: "user", content: `Question: ${question}\nAnswer: ${answer}` }
    ]
  });
  const txt = r.choices[0].message.content.toLowerCase();
  return txt.includes("yes");
}

module.exports = { isCommonQuestion };
