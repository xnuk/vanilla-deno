import { generateIdentifier } from './identifier.ts';

// createContainer is used for local scoping of CSS containers
// For now it is mostly just an alias of generateIdentifier
export const createContainer = (debugId?: string) =>
  generateIdentifier(debugId);
