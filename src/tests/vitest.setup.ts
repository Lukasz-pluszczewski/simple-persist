// @ts-ignore - runtime polyfill
import EventSourceImpl from 'eventsource';

// Provide EventSource for the client
if (!(globalThis as any).EventSource)
  (globalThis as any).EventSource = EventSourceImpl;

// Ensure fetch exists (Node 18+ has global fetch)
if (!(globalThis as any).fetch)
  throw new Error('Node 18+ required (global fetch)');

// JSDOM does not have flushHeaders on response; our server guards it with optional chaining
