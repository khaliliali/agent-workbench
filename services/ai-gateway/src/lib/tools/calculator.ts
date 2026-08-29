import { tool } from 'ai';
import { z } from 'zod';
import { evaluate } from 'mathjs';

export const calculatorTool = tool({
  description:
    'Perform a basic math calculation. Use this for any arithmetic the user asks about.',
  inputSchema: z.object({
    expression: z
      .string()
      .describe(
        "A math expression to evaluate, e.g. '47 * 892' or '(12 + 8) / 4'",
      ),
  }),
  execute: async ({ expression }) => {
    try {
      return String(evaluate(expression));
    } catch {
      return 'Error: could not evaluate that expression';
    }
  },
});
