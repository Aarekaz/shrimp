import { z } from 'zod';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Capability, Tool, ToolResult, ToolUseContext } from '../../core/types';
import { ok, err, type Result } from '../../core/types';

export interface BrowserConfig {
  headless?: boolean;
  executablePath?: string;  // path to Chrome/Chromium binary
  sessionPath?: string;     // persist cookies/auth state
}

export class BrowserCapability implements Capability {
  name = 'browser';
  description = 'Browse the web — navigate, click, type, extract content, take screenshots';
  private config: BrowserConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: BrowserConfig = {}) {
    this.config = config;
  }

  get tools(): Tool[] {
    return [
      {
        name: 'browser.navigate',
        description: 'Navigate to a URL and return the page title and text content.',
        parameters: z.object({
          url: z.string().describe('The URL to navigate to'),
        }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input) => this.withPage(async (page) => {
          await page.goto(input.url as string, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const title = await page.title();
          const text = await page.evaluate(() => {
            const body = document.body;
            // Remove scripts and styles
            body.querySelectorAll('script, style, noscript').forEach(el => el.remove());
            return body.innerText.slice(0, 8000);
          });
          return ok({ title: `Navigated: ${title}`, output: { url: input.url, title, text } });
        }),
      },
      {
        name: 'browser.click',
        description: 'Click an element on the page by its text content or CSS selector.',
        parameters: z.object({
          selector: z.string().describe('CSS selector or text content to click (e.g., "Submit" or "#login-btn")'),
        }),
        isReadOnly: false,
        approvalLevel: 'notify' as const,
        handler: async (input) => this.withPage(async (page) => {
          const selector = input.selector as string;
          try {
            // Try as text first
            await page.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
          } catch {
            // Fall back to CSS selector
            await page.click(selector, { timeout: 5000 });
          }
          await page.waitForTimeout(500);
          const title = await page.title();
          return ok({ title: `Clicked: ${selector}`, output: { clicked: selector, pageTitle: title } });
        }),
      },
      {
        name: 'browser.type',
        description: 'Type text into an input field identified by selector.',
        parameters: z.object({
          selector: z.string().describe('CSS selector for the input field (e.g., "#email", "[name=search]")'),
          text: z.string().describe('Text to type'),
        }),
        isReadOnly: false,
        approvalLevel: 'notify' as const,
        handler: async (input) => this.withPage(async (page) => {
          await page.fill(input.selector as string, input.text as string);
          return ok({ title: `Typed into ${input.selector}`, output: { selector: input.selector, typed: input.text } });
        }),
      },
      {
        name: 'browser.screenshot',
        description: 'Take a screenshot of the current page. Returns a base64-encoded image.',
        parameters: z.object({
          fullPage: z.boolean().optional().describe('Capture the full scrollable page (default: viewport only)'),
        }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input) => this.withPage(async (page) => {
          const buffer = await page.screenshot({
            fullPage: (input.fullPage as boolean) ?? false,
            type: 'png',
          });
          const base64 = buffer.toString('base64');
          const title = await page.title();
          return ok({
            title: `Screenshot: ${title}`,
            output: { pageTitle: title, url: page.url(), imageBase64: base64.slice(0, 200) + '...(truncated for context)' },
            metadata: { fullBase64Length: base64.length },
          });
        }),
      },
      {
        name: 'browser.extract',
        description: 'Extract specific information from the current page using a natural language instruction. Uses the model to interpret the page content.',
        parameters: z.object({
          instruction: z.string().describe('What to extract (e.g., "all product prices", "the main article text", "form field labels")'),
        }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input, ctx) => this.withPage(async (page) => {
          const text = await page.evaluate(() => document.body.innerText.slice(0, 10000));
          const url = page.url();

          if (!ctx?.model) {
            return ok({ title: 'Extracted page text', output: { url, text: text.slice(0, 3000) } });
          }

          // Use the model to interpret
          const response = await ctx.model.generate([
            { role: 'system', content: 'You are a data extraction assistant. Extract exactly what is asked from the page content. Be concise and structured.' },
            { role: 'user', content: `Page URL: ${url}\n\nPage content:\n${text}\n\nExtract: ${input.instruction}` },
          ]);

          return ok({ title: `Extracted: ${(input.instruction as string).slice(0, 50)}`, output: { url, extracted: response.content } });
        }),
      },
      {
        name: 'browser.links',
        description: 'Get all links on the current page with their text and URLs.',
        parameters: z.object({
          filter: z.string().optional().describe('Optional text filter to narrow down links'),
        }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input) => this.withPage(async (page) => {
          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
              text: (a as HTMLAnchorElement).innerText.trim().slice(0, 100),
              href: (a as HTMLAnchorElement).href,
            })).filter(l => l.text.length > 0);
          });

          const filter = input.filter as string | undefined;
          const filtered = filter
            ? links.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()) || l.href.toLowerCase().includes(filter.toLowerCase()))
            : links.slice(0, 50);

          return ok({ title: `${filtered.length} links found`, output: { links: filtered } });
        }),
      },
      {
        name: 'browser.form',
        description: 'Fill out a form on the current page. Provide field selectors and values as key-value pairs.',
        parameters: z.object({
          fields: z.record(z.string()).describe('Map of CSS selector → value (e.g., {"#email": "me@x.com", "#password": "***"})'),
          submit: z.string().optional().describe('CSS selector or text of the submit button to click after filling'),
        }),
        isReadOnly: false,
        approvalLevel: 'approve' as const,
        handler: async (input) => this.withPage(async (page) => {
          const fields = input.fields as Record<string, string>;
          const filled: string[] = [];

          for (const [selector, value] of Object.entries(fields)) {
            await page.fill(selector, value);
            filled.push(selector);
          }

          if (input.submit) {
            try {
              await page.getByText(input.submit as string, { exact: false }).first().click({ timeout: 5000 });
            } catch {
              await page.click(input.submit as string, { timeout: 5000 });
            }
            await page.waitForTimeout(1000);
          }

          const title = await page.title();
          return ok({
            title: `Form filled: ${filled.length} fields`,
            output: { filled, submitted: !!input.submit, pageTitle: title },
          });
        }),
      },
      {
        name: 'browser.wait',
        description: 'Wait for an element to appear on the page.',
        parameters: z.object({
          selector: z.string().describe('CSS selector to wait for'),
          timeout: z.number().optional().describe('Max wait time in ms (default: 10000)'),
        }),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async (input) => this.withPage(async (page) => {
          const timeout = (input.timeout as number) ?? 10000;
          await page.waitForSelector(input.selector as string, { timeout });
          return ok({ title: `Element found: ${input.selector}`, output: { found: true, selector: input.selector } });
        }),
      },
      {
        name: 'browser.tabs',
        description: 'List all open browser tabs.',
        parameters: z.object({}),
        isReadOnly: true,
        approvalLevel: 'auto' as const,
        handler: async () => {
          if (!this.context) {
            return ok({ title: 'No browser open', output: { tabs: [] } });
          }
          const pages = this.context.pages();
          const tabs = await Promise.all(pages.map(async (p, i) => ({
            index: i,
            url: p.url(),
            title: await p.title(),
          })));
          return ok({ title: `${tabs.length} tab(s)`, output: { tabs } });
        },
      },
    ];
  }

  private async withPage<T>(fn: (page: Page) => Promise<Result<ToolResult>>): Promise<Result<ToolResult>> {
    try {
      const page = await this.getOrCreatePage();
      return await fn(page);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Truncate Playwright errors which can be very verbose
      const clean = msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
      return err({ code: 'BROWSER_ERROR', message: clean, retryable: true });
    }
  }

  private async getOrCreatePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;

    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless ?? true,
        executablePath: this.config.executablePath,
      });
    }

    if (!this.context) {
      this.context = this.config.sessionPath
        ? await this.browser.newContext({ storageState: this.config.sessionPath }).catch(() => this.browser!.newContext())
        : await this.browser.newContext();
    }

    this.page = await this.context.newPage();
    return this.page;
  }

  async start(): Promise<void> {
    const mode = this.config.headless === false ? 'visible' : 'headless';
    console.log(`  🌐 Browser capability ready (${mode})`);
    if (this.config.executablePath) {
      console.log(`     Chrome: ${this.config.executablePath}`);
    }
  }

  async stop(): Promise<void> {
    // Save session state before closing
    if (this.context && this.config.sessionPath) {
      try {
        await this.context.storageState({ path: this.config.sessionPath });
      } catch {}
    }
    try { await this.browser?.close(); } catch {}
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
