import type { PromptMap } from "@/types/session";

export function buildFiveStagePrompt(prompts: PromptMap) {
  const { head = "", torso = "", legs = "", pose = "", background = "" } = prompts;

  return `You are a master image compositor. Follow each directive in strict chronological order without overwriting earlier results.

CRITICAL FACE PRESERVATION & NATURAL BLENDING REQUIREMENT:
- The FACE (facial features, eyes, nose, mouth, facial structure, skin tone, expression) from the goal image MUST be preserved and remain recognizable throughout all stages.
- IMPORTANT: Preserve the face naturally, but seamlessly blend it with new elements - do NOT create a "cut and paste" look.
- The facial features from the goal image must remain intact, but blend naturally with lighting, shadows, and surrounding elements from player descriptions.
- CRITICAL: If the player does NOT mention glasses, hats, facial hair, or other facial accessories in their description, DO NOT add them - use the ORIGINAL face from the goal image exactly as it is.
- ONLY apply what the player explicitly describes - do NOT add accessories or modifications that were not mentioned by the player.
- Apply natural lighting transitions between the preserved face and new body/clothing elements to create a seamless, photorealistic composition.
- The goal image's face should look NATURALLY integrated with the new composition, not artificially overlaid or cut out.
- All player descriptions must be applied around the preserved face, creating a harmonious blend rather than a disjointed composition.

CRITICAL IMAGE ORIENTATION REQUIREMENT:
- The output image MUST be VERTICAL/PORTRAIT orientation ONLY.
- Image dimensions: HEIGHT must be GREATER than WIDTH (e.g., 1080x1920, 720x1280, or 9:16 aspect ratio).
- NEVER create a horizontal/landscape image where width > height.
- This is a MANDATORY requirement that cannot be ignored.

Stage 1 — Facial Preservation & Head Details:
- Preserve the FACE from the goal image (eyes, nose, mouth, facial structure, skin tone, expression) maintaining the original facial characteristics.
- IMPORTANT: Keep the face recognizable, but naturally blend it with new lighting and elements - create seamless transitions, not harsh cut-outs.
- CRITICAL RULE: Only apply what the player explicitly describes in their prompt - do NOT add glasses, hats, facial hair, or other accessories unless the player mentions them.
- If the player's description is empty or does not mention facial accessories, use the ORIGINAL face from the goal image EXACTLY as it is - do not add any modifications.
- The face should maintain its original appearance but be naturally illuminated and integrated with the new composition.
- Apply ONLY what the player describes: ${head}
- IMPORTANT: If the player description is empty or does not mention specific accessories, use the face from the goal image unchanged.
- Only create natural shadow and lighting transitions if the player actually describes accessories - otherwise, keep the face exactly as in the goal image.

Stage 2 — Upper Body Styling:
- Build the torso, clothing, accessories, and hand-held objects EXACTLY as described by the player - do NOT add elements not mentioned: ${torso}
- IMPORTANT: Only include what the player explicitly describes - do not add clothing, accessories, or objects that were not mentioned.
- CRITICAL: Seamlessly blend the new upper body elements with the preserved face from Stage 1.
- Create natural lighting transitions between the face and new clothing - ensure shadows, highlights, and skin tones blend harmoniously.
- The neck and shoulder area should transition naturally from the preserved face to the new clothing, avoiding any visible seams or mismatched lighting.
- Maintain realistic lighting consistency across the face and body for a natural, photorealistic appearance.

Stage 3 — Lower Body Styling:
- Design the lower body, legs, footwear, and additional accessories EXACTLY as described by the player - do NOT add elements not mentioned: ${legs}
- IMPORTANT: Only include what the player explicitly describes - do not add pants, footwear, or accessories that were not mentioned.
- Ensure smooth continuity between upper and lower body elements with consistent lighting and shadows.
- Create natural flow from the preserved face through the body to the legs - maintain lighting consistency throughout the entire figure.
- Blend shadows and highlights naturally to create a cohesive, unified appearance rather than disconnected parts.

Stage 4 — Pose & Movement:
- Pose the subject EXACTLY as described by the player - do NOT add movements or poses not mentioned: ${pose}
- IMPORTANT: Only apply the pose the player explicitly describes - do not add additional movements or gestures.
- IMPORTANT: Compose the pose vertically to fit portrait orientation (subject standing upright, vertical composition).
- Maintain the preserved face while adjusting body posture naturally - ensure facial features remain recognizable.
- Create natural body movement and pose that feels integrated with the preserved face, avoiding any unnatural disconnection.
- Adjust lighting and shadows on the preserved face to match the new pose and body position for a cohesive look.

Stage 5 — Background & Environment:
- Place the composed subject into the environment EXACTLY as described by the player - do NOT add environmental elements not mentioned: ${background}
- IMPORTANT: Only include the background environment the player explicitly describes - do not add objects, scenery, or details that were not mentioned.
- IMPORTANT: Frame the background vertically to maintain portrait orientation (height > width).
- CRITICAL: Blend environmental lighting with the subject's lighting to create a natural, unified scene.
- Adjust shadows and highlights on the preserved face to match the background environment's lighting direction and intensity.
- Create realistic environmental reflections and lighting interactions on the subject (especially the preserved face) to avoid a "green screen" or "cut-out" appearance.
- The final composition should look like a single, naturally photographed scene, not a composite of disconnected elements.

Rendering Requirements:
- MANDATORY: Output image MUST have VERTICAL dimensions: height > width (portrait/vertical orientation).
- Aspect ratio must be approximately 9:16 (vertical) or similar portrait format.
- NEVER output a horizontal/landscape image where width > height.
- Produce an ultra-realistic, photorealistic 8K full-body portrait in VERTICAL/PORTRAIT orientation.
- Show the complete body from head to toe. Ensure the full figure is visible, not cut off at the torso or waist.
- The subject must be standing or posed vertically to fit the portrait orientation.
- Cinematic lighting, high dynamic range, physically accurate materials.
- CRITICAL FINAL CHECK: The face from the goal image must be preserved and recognizable, seamlessly blended with all new elements.
- CRITICAL RULE: The final result must ONLY contain what the players explicitly described in their prompts - do NOT add accessories, clothing, poses, or background elements that were not mentioned.
- If a player did NOT mention glasses, hats, facial hair, or facial accessories, use the ORIGINAL face from the goal image unchanged.
- Create natural, seamless transitions throughout the entire image - avoid visible seams, mismatched lighting, or "cut and paste" artifacts.
- The final image must look like a single, naturally captured photograph with:
  - Unified lighting across face, body, and background
  - Natural shadow transitions
  - Realistic color harmony
  - Seamless integration of all elements
- Never create a disjointed or artificially composited appearance - everything should feel naturally integrated.
- The preserved face should look naturally illuminated by the scene's lighting, not appear separately lit or overlaid.
- IMPORTANT: Only add props (glasses, hats, facial hair) if the player explicitly mentioned them - otherwise, use the original face from the goal image unchanged.
- The final image must show a complete, full-body figure standing or posed within the scene in VERTICAL/PORTRAIT orientation (height > width), with the goal image's face naturally preserved and ONLY elements explicitly described by players included.`;
}

