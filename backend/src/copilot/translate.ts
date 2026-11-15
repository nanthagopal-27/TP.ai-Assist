import { askCopilot } from "./ask";

/** Deterministic, programmatically-built instruction - never a free-form user prompt,
 * so the agent's reply is reliably just the translation. */
function buildTranslationPrompt(text: string, targetLanguage: string): string {
  return (
    `Translate the following text to ${targetLanguage}. Return only the translated text. ` +
    "Do not add explanations, markdown, citations, or additional comments.\n\n" +
    `Text:\n${text}`
  );
}

export async function translateWithCopilot(text: string, targetLanguage: string): Promise<string> {
  const prompt = buildTranslationPrompt(text, targetLanguage);
  console.log("[Copilot] Sending translation request");
  const result = await askCopilot(prompt);
  console.log("[Copilot] Response received");
  return result;
}
