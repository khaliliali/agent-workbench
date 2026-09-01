export interface TestCase {
  id: string;
  question: string;
  expectedFact: string;
  gradingMethod: 'exact-match' | 'llm-judge';
  category: 'rag' | 'tool-calling' | 'negative';
}

export const testCases: TestCase[] = [
  {
    id: 'rag-nimbus-badge',
    question: "What's the codename on the Nimbus Freight security badge?",
    expectedFact: 'PROJECT INKWELL',
    gradingMethod: 'exact-match',
    category: 'rag',
  },
  {
    id: 'rag-nimbus-robots',
    question: 'How many Marigold Units does Nimbus Freight have?',
    expectedFact: '27',
    gradingMethod: 'exact-match',
    category: 'rag',
  },
  {
    id: 'rag-bakery-recipe',
    question: "What's Copper Fig Bakery's secret recipe called?",
    expectedFact: 'Velvet Ember Loaf',
    gradingMethod: 'llm-judge',
    category: 'rag',
  },
  {
    id: 'tool-calculator',
    question: "What's 47 times 892?",
    expectedFact: '41924',
    gradingMethod: 'llm-judge',
    category: 'tool-calling',
  },
  {
    id: 'negative-unrelated',
    question: "What's the third oven at Nimbus Freight called?",
    expectedFact:
      "The answer should indicate this information isn't available or isn't about Nimbus Freight (the oven detail belongs to Copper Fig Bakery, a different document)",
    gradingMethod: 'llm-judge',
    category: 'negative',
  },
];
