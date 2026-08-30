import { tool } from 'ai';
import { z } from 'zod';
import { evaluate } from 'mathjs';

export const calculatorTool = tool({
  description:
    'Evaluate a math or logic expression. Supports arithmetic, arrays, strings, comparisons, and common functions (e.g. sqrt, sin, round). Use this for calculations, data transformations, or logical checks — not for running arbitrary code.',
  inputSchema: z.object({
    expression: z
      .string()
      .describe(
        "An expression to evaluate, e.g. '47 * 892', 'sqrt(16)', or '[1,2,3].map(x => x * 2)' style array operations supported by mathjs syntax",
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
