// How to send an enquiry, and which route an agent can complete — generated
// from src/data/enquiry.ts, the module the /contact/ form reads its fields,
// limits and "what happens next" from, so the two cannot disagree.
import type { APIRoute } from 'astro';
import { enquiryContract } from '../../data/enquiry';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(enquiryContract(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
