// services/openai.js
const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Embeddings */
async function embedText(text) {
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return r.data[0].embedding;
}

/** Quick translate */
async function translateToEnglish(text) {
  const r = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "Translate the user's message into English. Reply with English only." },
      { role: "user", content: text },
    ],
  });
  return r.choices[0].message.content.trim();
}

/* ---------- helper: attach images to latest user message ---------- */
function attachImagesToLatestUser(messages, images = []) {
  if (!images || images.length === 0) return messages;

  // clone shallow to avoid mutating caller's array
  const msgs = messages.map(m => ({ ...m }));

  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      const content = msgs[i].content;

      // Normalize current content into parts array
      let parts = [];
      if (Array.isArray(content)) {
        parts = content.slice();
      } else if (typeof content === "string") {
        parts = [{ type: "text", text: content }];
      } else if (content) {
        // unknown structure → stringify as text
        parts = [{ type: "text", text: JSON.stringify(content) }];
      } else {
        parts = [{ type: "text", text: "" }];
      }

      // Append image parts
      for (const url of images) {
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          parts.push({ type: "image_url", image_url: { url } });
        }
      }

      msgs[i] = { role: "user", content: parts };
      break;
    }
  }
  return msgs;
}

/**
 * Stream completions with optional tool calling + vision.
 * messages: full chat history [{role:'user'|'assistant'|'system', content}]
 */
async function* streamLLM(
  messages,
  {
    toolHandlers = {},
    model = "gpt-5",          // controller can override (e.g., "gpt-4o")
    temperature = 1,
    systemPrompt =
      "You are a helpful, accurate assistant. Use the available tools for any live/real-time data. " +
      "When a tool returns data, use it directly and do not claim you lack real-time access.",
    images = []               // <-- NEW: array of absolute image URLs
  } = {}
) {
  const tools = [
    {
      type: "function",
      function: { name: "get_now", description: "Return current server ISO datetime.", parameters: { type: "object", properties: {} } }
    },
    {
      type: "function",
      function: {
        name: "get_crypto_price",
        description: "Get live crypto price in USD by symbol (e.g., BTC, ETH).",
        parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] }
      }
    },
    {
      type: "function",
      function: {
        name: "get_fx_rate",
        description: "Get live FX rate for a pair like USD/INR.",
        parameters: { type: "object", properties: { pair: { type: "string" } }, required: ["pair"] }
      }
    },
  ];

  // Build probe messages: system + history; attach images to latest user turn
  const probeMsgs = attachImagesToLatestUser(
    [{ role: "system", content: systemPrompt }, ...messages],
    images
  );

  // Non-stream probe to see if the model wants tool(s)
  const probe = await client.chat.completions.create({
    model,
    temperature,
    tools,
    tool_choice: "auto",
    messages: probeMsgs,
  });

  const choice = probe.choices?.[0];
  const toolCalls = choice?.message?.tool_calls || [];

  if (toolCalls.length > 0) {
    // assistant message that requested tools
    const assistantToolMsg = {
      role: "assistant",
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments || "{}" }
      })),
    };

    // run tools and build tool messages
    const toolMsgs = [];
    for (const tc of toolCalls) {
      const handler = toolHandlers[tc.function.name];
      let result;
      try {
        const args = JSON.parse(tc.function.arguments || "{}");
        if (!handler) throw new Error(`No handler implemented for ${tc.function.name}`);
        result = await handler(args);
      } catch (err) {
        result = { error: err.message || "tool failed" };
      }
      toolMsgs.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      });
    }

    // Stream the final answer (keep images attached to the latest user)
    const followMsgs = attachImagesToLatestUser(
      [{ role: "system", content: systemPrompt }, ...messages, assistantToolMsg, ...toolMsgs],
      images
    );

    const follow = await client.chat.completions.create({
      model,
      stream: true,
      temperature,
      messages: followMsgs,
    });

    for await (const ev of follow) {
      const token = ev.choices?.[0]?.delta?.content;
      if (token) yield token;
    }
    return;
  }

  // No tools → stream directly (with images attached)
  const directMsgs = attachImagesToLatestUser(
    [{ role: "system", content: systemPrompt }, ...messages],
    images
  );

  const direct = await client.chat.completions.create({
    model,
    stream: true,
    temperature,
    messages: directMsgs,
  });

  for await (const ev of direct) {
    const token = ev.choices?.[0]?.delta?.content;
    if (token) yield token;
  }
}

module.exports = { client, embedText, translateToEnglish, streamLLM };
