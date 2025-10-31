import { NextResponse } from "next/server";

import { generateCompositeImage } from "@/lib/gemini";
import { buildFiveStagePrompt } from "@/lib/promptBuilder";

const SECTION_COUNT = 5;

export async function POST(request: Request) {
  try {
    const { prompts, goalImageBase64 } = (await request.json()) as {
      prompts?: string[];
      goalImageBase64?: string;
    };

    if (!Array.isArray(prompts) || prompts.length !== SECTION_COUNT) {
      return NextResponse.json(
        { error: "Prompts for all five sections are required." },
        { status: 400 },
      );
    }

    if (!goalImageBase64) {
      return NextResponse.json(
        { error: "Goal image is missing. Please upload an image and try again." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server is not configured with GEMINI_API_KEY." },
        { status: 500 },
      );
    }

    const [head, torso, legs, pose, background] = prompts;

    const combinedPrompt = buildFiveStagePrompt({ head, torso, legs, pose, background });

    const base64Data = await generateCompositeImage({
      apiKey,
      prompt: combinedPrompt,
      goalImageBase64,
    });

    return NextResponse.json({ image: base64Data, finalPrompt: combinedPrompt });
  } catch (error) {
    console.error("Error generating image:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

