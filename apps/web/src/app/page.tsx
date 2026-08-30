'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { evaluate } from 'mathjs';

function evaluateExpression(expression: string): string {
  try {
    const result = evaluate(expression);
    return String(result);
  } catch {
    return 'Error: could not evaluate that expression';
  }
}

export default function Home() {
  const { messages, sendMessage, addToolResult, status, error } = useChat({
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === 'calculator') {
        const input = toolCall.input as { expression: string };
        const result = evaluateExpression(input.expression);

        addToolResult({
          tool: 'calculator',
          toolCallId: toolCall.toolCallId,
          output: result,
        });
      }
    },
  });
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 16 }}>
      <div>
        {messages.map((message) => (
          <div key={message.id} style={{ marginBottom: 12 }}>
            <strong>{message.role === 'user' ? 'You: ' : 'Claude: '}</strong>
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <span key={index}>{part.text}</span>
              ) : null,
            )}
          </div>
        ))}
      </div>

      {status === 'submitted' && (
        <div style={{ color: '#888', fontStyle: 'italic' }}> Thinking...</div>
      )}

      {error && (
        <div style={{ color: '#c00', marginTop: 8 }}>
          Something went wrong: {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Say something...'
          disabled={status === 'submitted' || status === 'streaming'}
          style={{ width: '100%', padding: 8 }}
        />
      </form>
    </div>
  );
}
