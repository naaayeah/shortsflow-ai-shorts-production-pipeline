import { NextRequest, NextResponse } from 'next/server';

type GenerateTask = 'script' | 'scenes' | 'srt';

interface GenerateRequestBody {
  task: GenerateTask;
  prompt: string;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured on the server.' },
        { status: 500 },
      );
    }

    const body = (await req.json()) as GenerateRequestBody;
    const { task, prompt } = body;

    if (!task || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: task, prompt.' },
        { status: 400 },
      );
    }

    if (!['script', 'scenes', 'srt'].includes(task)) {
      return NextResponse.json({ error: 'Invalid task type.' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      model: MODEL,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            task === 'scenes'
              ? 'Return valid JSON only. Do not wrap in markdown.'
              : 'Follow the user instructions precisely.',
        },
        { role: 'user', content: prompt },
      ],
    };

    if (task === 'scenes') {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'scene_list',
          strict: true,
          schema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sceneNumber: { type: 'number' },
                script: { type: 'string' },
                imagePrompt: { type: 'string' },
              },
              required: ['sceneNumber', 'script', 'imagePrompt'],
              additionalProperties: false,
            },
          },
        },
      };
    }

    const openAIResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await openAIResponse.json();

    if (!openAIResponse.ok) {
      const message =
        data?.error?.message || 'OpenAI API request failed. Please check server logs.';
      return NextResponse.json({ error: message }, { status: openAIResponse.status });
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return NextResponse.json(
        { error: 'OpenAI returned an empty response.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
