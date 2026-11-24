import type { components } from '@famsync/api-client';

export type AskStatus = components['schemas']['FamilyAiStatusDto'];
export type AskAnswer = { question: string; answer: string; nodeIds: string[] };
export const askExamples = ['What’s due this week?', 'What is coming up for the family?', 'Which goals are furthest along?'];

/** The notice members accept, word for word as on web. Raise noticeVersion in family-ai.service.ts whenever it changes. */
export const askNotice = [
  'Your question and the Family Base records you can see are sent to Google’s Gemini service to write an answer.',
  'That includes names, titles, dates, statuses, locations, and notes on memories, places and ideas, including your private ones.',
  'Chat messages, file contents and email addresses are not sent.',
  'FamSync doesn’t store questions or answers. Google may keep them for a limited time to detect misuse.',
  'Answers can be wrong. Check the linked records.',
];

/** What the person can do now. The server checks each of these again. */
export const askStep = (status: AskStatus): 'unavailable' | 'off' | 'consent' | 'ready' => !status.available ? 'unavailable' : !status.enabled ? 'off' : !status.consented ? 'consent' : 'ready';

/** How long to wait. A question takes the AI service up to 45 seconds; a sleeping server takes up to a minute to wake. */
export const requestLimit = (url: string) => /\/base\/ai\/questions$/.test(url) ? 65_000 : /\/mobile\/android\/version$/.test(url) ? 70_000 : 30_000;
