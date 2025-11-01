import type { PromptMap } from "@/types/session";

export function buildFiveStagePrompt(prompts: PromptMap) {
  const { head = "", torso = "", legs = "", pose = "", background = "" } = prompts;

  return `You are a master image compositor. Follow each directive in strict chronological order without overwriting earlier results.

Stage 1 — Facial Preservation & Head Details:
- Extract the entire face from the provided reference image and keep it 100% unchanged. Maintain original skin tone, expression, lighting, facial proportions, and micro-details.
- Apply the player's description around the preserved face without altering it: ${head}

Stage 2 — Upper Body Styling:
- Build the torso, clothing, accessories, and hand-held objects exactly as described: ${torso}
- Integrate seamlessly with Stage 1 while keeping the face untouched.

Stage 3 — Lower Body Styling:
- Design the lower body, legs, footwear, and additional accessories according to: ${legs}
- Ensure continuity with the upper body while respecting the preserved face.

Stage 4 — Pose & Movement:
- Pose the subject using: ${pose}
- Preserve every detail from Stages 1–3 while adjusting limb positions and body posture.

Stage 5 — Background & Environment:
- Place the composed subject into the environment: ${background}
- Do not modify the subject from Stages 1–4; only blend lighting and shadows.

Rendering Requirements:
- Produce an ultra-realistic, photorealistic 8K full-body portrait in vertical/portrait orientation (9:16 aspect ratio or similar).
- Show the complete body from head to toe. Ensure the full figure is visible, not cut off at the torso or waist.
- Cinematic lighting, high dynamic range, physically accurate materials.
- Never stylize the face or obscure it with artifacts. Additional props (glasses, hats, facial hair) must layer naturally without changing the original facial features.
- The final image must show a complete, full-body figure standing or posed within the scene.`;
}

