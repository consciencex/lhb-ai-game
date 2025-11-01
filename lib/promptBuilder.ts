import type { PromptMap } from "@/types/session";

export function buildFiveStagePrompt(prompts: PromptMap) {
  const { head = "", torso = "", legs = "", pose = "", background = "" } = prompts;

  return `You are a master image compositor. Follow each directive in strict chronological order without overwriting earlier results.

CRITICAL FACE PRESERVATION REQUIREMENT (ONLY THE FACE FROM GOAL IMAGE):
- IMPORTANT: Only the FACE portion from the goal image must be preserved - NOT the entire goal image.
- The FACE (facial features, eyes, nose, mouth, skin tone, expression) from the goal image MUST remain 100% UNCHANGED throughout all stages - this is ABSOLUTELY MANDATORY.
- ONLY preserve the face - you can freely modify the body, clothing, pose, background, and all other elements from the goal image.
- NEVER modify, alter, stylize, or change the original face structure, facial features, skin tone, expression, or lighting from the goal image.
- The face from the goal image is SACRED and must be protected - everything else can be changed.
- All player descriptions must be applied AROUND the preserved face, not ON or IN PLACE OF it.
- Extract ONLY the face region from the goal image and keep it unchanged - replace everything else based on player prompts.

CRITICAL IMAGE ORIENTATION REQUIREMENT:
- The output image MUST be VERTICAL/PORTRAIT orientation ONLY.
- Image dimensions: HEIGHT must be GREATER than WIDTH (e.g., 1080x1920, 720x1280, or 9:16 aspect ratio).
- NEVER create a horizontal/landscape image where width > height.
- This is a MANDATORY requirement that cannot be ignored.

Stage 1 — Facial Preservation & Head Details:
- CRITICAL: Extract ONLY the FACE (eyes, nose, mouth, facial structure, skin tone, expression) from the goal image and keep it 100% UNCHANGED and UNTOUCHED.
- The face from the goal image is the ABSOLUTE REFERENCE - maintain original skin tone, expression, lighting, facial proportions, micro-details, and ALL facial characteristics EXACTLY as they appear in the goal image.
- IMPORTANT: You do NOT need to preserve other parts of the goal image (body, clothing, background) - ONLY the face must be preserved.
- Apply the player's description AROUND the preserved face (e.g., hats, glasses, hair styling) WITHOUT altering the face itself: ${head}
- Remember: ONLY the face from the goal image is sacred - everything else can be completely changed based on player prompts.

Stage 2 — Upper Body Styling:
- Build the torso, clothing, accessories, and hand-held objects exactly as described: ${torso}
- IMPORTANT: You can completely replace the body/clothing from the goal image - ONLY the face must remain unchanged.
- Integrate seamlessly with Stage 1 while keeping ONLY the face from the goal image COMPLETELY UNTOUCHED.
- CRITICAL: The face from the goal image must remain 100% unchanged - everything else (body, clothing) can be replaced freely.

Stage 3 — Lower Body Styling:
- Design the lower body, legs, footwear, and additional accessories according to: ${legs}
- IMPORTANT: You can completely replace the lower body from the goal image - ONLY the face must remain unchanged.
- Ensure continuity with the upper body while RESPECTING and PRESERVING ONLY the face from the goal image at all costs.
- The face from the goal image is still the only part that must remain completely unchanged - everything else can be modified.

Stage 4 — Pose & Movement:
- Pose the subject using: ${pose}
- IMPORTANT: You can change the pose completely from the goal image - ONLY the face must remain unchanged.
- Preserve EVERY detail from Stages 1–3, especially ONLY the face from the goal image which MUST remain 100% unchanged.
- IMPORTANT: Compose the pose vertically to fit portrait orientation (subject standing upright, vertical composition).
- CRITICAL: ONLY the face from the goal image must remain unchanged - body posture, pose, and all other elements can be modified freely.

Stage 5 — Background & Environment:
- Place the composed subject into the environment: ${background}
- IMPORTANT: You can completely replace the background from the goal image - ONLY the face must remain unchanged.
- Do not modify the subject from Stages 1–4, especially ONLY the face from the goal image which must remain completely unchanged.
- IMPORTANT: Frame the background vertically to maintain portrait orientation (height > width).
- FINAL REMINDER: ONLY the face from the goal image must still be 100% preserved at this final stage - everything else (body, clothing, pose, background) can be different from the goal image.

Rendering Requirements:
- MANDATORY: Output image MUST have VERTICAL dimensions: height > width (portrait/vertical orientation).
- Aspect ratio must be approximately 9:16 (vertical) or similar portrait format.
- NEVER output a horizontal/landscape image where width > height.
- Produce an ultra-realistic, photorealistic 8K full-body portrait in VERTICAL/PORTRAIT orientation.
- Show the complete body from head to toe. Ensure the full figure is visible, not cut off at the torso or waist.
- The subject must be standing or posed vertically to fit the portrait orientation.
- Cinematic lighting, high dynamic range, physically accurate materials.
- CRITICAL FINAL CHECK: ONLY the face from the goal image MUST be 100% preserved and unchanged in the final output - everything else (body, clothing, pose, background) can be completely different from the goal image based on player prompts.
- Never stylize the face or obscure it with artifacts. Additional props (glasses, hats, facial hair) must layer naturally without changing the original facial features from the goal image.
- The face from the goal image is the absolute reference - ONLY the face must look IDENTICAL to the original face in the goal image. The rest can be different.
- The final image must show a complete, full-body figure standing or posed within the scene in VERTICAL/PORTRAIT orientation (height > width), with ONLY the face from the goal image preserved perfectly - all other elements are created based on player descriptions.`;
}

