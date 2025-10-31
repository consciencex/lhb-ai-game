const GEMINI_IMAGE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

export interface GeminiImageRequest {
  apiKey: string;
  prompt: string;
  goalImageBase64: string;
  goalImageMimeType?: string;
  maxAttempts?: number;
}

export async function generateCompositeImage({
  apiKey,
  prompt,
  goalImageBase64,
  goalImageMimeType = "image/jpeg",
  maxAttempts = 5,
}: GeminiImageRequest) {
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: goalImageMimeType,
              data: goalImageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const apiUrl = `${GEMINI_IMAGE_ENDPOINT}?key=${apiKey}`;

  let attempt = 0;
  let delay = 1000;
  let lastResponse: Response | undefined;

  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      const base64Data: string | undefined = result?.candidates?.[0]?.content?.parts?.find(
        (part: { inlineData?: { data?: string } }) => Boolean(part?.inlineData?.data),
      )?.inlineData?.data;

      if (!base64Data) {
        throw new Error("No image data received from Gemini API.");
      }

      return base64Data;
    }

    lastResponse = response;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
  }

  if (lastResponse) {
    let errorMessage = `Gemini API error (status ${lastResponse.status})`;
    try {
      const errorBody = await lastResponse.json();
      if (typeof errorBody?.error?.message === "string") {
        errorMessage = errorBody.error.message;
      }
    } catch (error) {
      console.error("Failed to parse Gemini error response", error);
    }
    throw new Error(errorMessage);
  }

  throw new Error("No response received from Gemini API.");
}

