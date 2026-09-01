import { testCases, type TestCase } from './test-cases';

const APP_URL =
  process.env.APP_URL || 'https://agent-workbench-web.alikhalili.workers.dev';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function askApp(question: string): Promise<string> {
  const res = await fetch(`${APP_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ type: 'text', text: question }] }],
    }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.replace(/^data: /, '').trim();
      if (payload === '[DONE]') continue;

      try {
        const event = JSON.parse(payload);
        if (event.type === 'text-delta') {
          fullText += event.delta;
        }
      } catch (error) {
        console.error('Error parsing line:', line, error);
      }
    }
  }

  return fullText;
}

function gradeExactMatch(answer: string, expectedFact: string): boolean {
  return answer.toLowerCase().includes(expectedFact.toLowerCase());
}

async function gradeWithJudge(
  question: string,
  answer: string,
  expectedFact: string,
): Promise<boolean> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Question asked: "${question}"\n
          Answer given: "${answer}"\n
          Expected: "${expectedFact}"\n\n
          Does the answer correctly satisfy what's expected? Reply with only "PASS" or "FAIL".`,
        },
      ],
    }),
  });

  const data = await res.json();
  const textBlock = data.content.find(
    (block: { type: string; text?: string }) => block.type === 'text',
  );
  const verdict = (textBlock?.text ?? '').trim().toUpperCase();

  return verdict.includes('PASS');
}

async function runEvals() {
  console.log(`Running ${testCases.length} eval cases against ${APP_URL}\n`);
  let passed = 0;
  let failed = 0;
  for (const test of testCases) {
    process.stdout.write(`[${test.category}] ${test.id}... `);

    const answer = await askApp(test.question);

    const isPass =
      test.gradingMethod === 'exact-match'
        ? gradeExactMatch(answer, test.expectedFact)
        : await gradeWithJudge(test.question, answer, test.expectedFact);

    if (isPass) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL');
      console.log(`  Question: ${test.question}`);
      console.log(`  Expected: ${test.expectedFact}`);
      console.log(`  Got:  ${answer.slice(0, 200)}...`);
      failed++;
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

runEvals().catch(console.error);
