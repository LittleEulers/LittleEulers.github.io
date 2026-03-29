import OpenAI from "openai";
import { NextResponse } from "next/server";

type BusinessProfile = {
  name: string;
  industry: string;
  tone: string;
};

type RequestBody = {
  reviewText: string;
  businessProfile: BusinessProfile;
};

type ResponseOption = {
  style: "Appreciative" | "Empathetic" | "Professional/Problem-Solving";
  targetStars: 5 | 3 | 1;
  response: string;
};

type RouteOutput = {
  options: [ResponseOption, ResponseOption, ResponseOption];
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body?.reviewText || !body?.businessProfile?.name || !body?.businessProfile?.industry || !body?.businessProfile?.tone) {
      return NextResponse.json(
        {
          error:
            "Invalid input. Required: reviewText and businessProfile { name, industry, tone }.",
        },
        { status: 400 }
      );
    }

    const prompt = `You are writing business-owner review responses.

Business Profile
- Name: ${body.businessProfile.name}
- Industry: ${body.businessProfile.industry}
- Tone: ${body.businessProfile.tone}

Customer Review:
${body.reviewText}

Return exactly three response options:
1) Appreciative (for 5-star)
2) Empathetic (for 3-star)
3) Professional/Problem-Solving (for 1-star)

Keep each response concise, human, and brand-safe.`;

    const completion = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "review_response_options",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    style: {
                      type: "string",
                      enum: ["Appreciative", "Empathetic", "Professional/Problem-Solving"],
                    },
                    targetStars: { type: "integer", enum: [5, 3, 1] },
                    response: { type: "string", minLength: 1 },
                  },
                  required: ["style", "targetStars", "response"],
                },
              },
            },
            required: ["options"],
          },
          strict: true,
        },
      },
    });

    const parsed = JSON.parse(completion.output_text) as RouteOutput;

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate responses.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
