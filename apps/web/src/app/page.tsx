'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Home() {
  const { messages, sendMessage } = useChat();
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

      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Say something...'
          style={{ width: '100%', padding: 8 }}
        />
      </form>
    </div>
  );
}
