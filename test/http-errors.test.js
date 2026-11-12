import { describe, expect, test } from 'bun:test';
import { call, plainText } from '../src/providers/http.js';

const CF =
  '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"><HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1"><TITLE>ERROR: The request could not be satisfied</TITLE></HEAD><BODY><H1>403 ERROR</H1></BODY></HTML>';

describe('provider error text', () => {
  test('an HTML error page becomes its title, never markup', () => {
    const t = plainText(CF);
    expect(t).toBe('an HTML error page ("ERROR: The request could not be satisfied")');
    expect(t).not.toContain('<');
  });

  test('an HTML page with no title falls back to its visible text', () => {
    expect(plainText('<html><body><h1>Blocked</h1><script>x()</script></body></html>')).toBe('an HTML error page ("Blocked")');
    expect(plainText('<html></html>')).toBe('an HTML error page');
  });

  test('plain and JSON text is kept, cut at 200 characters', () => {
    expect(plainText('{"detail":"payment required"}')).toBe('{"detail":"payment required"}');
    expect(plainText('x'.repeat(500))).toHaveLength(200);
    expect(plainText('')).toBe('');
  });

  test('call() throws the readable message for an HTML 403', async () => {
    const fetchImpl = async () => new Response(CF, { status: 403 });
    await expect(call(fetchImpl, 'https://x.test')).rejects.toThrow('HTTP 403: an HTML error page ("ERROR: The request could not be satisfied")');
  });
});
