export interface EmailTemplate {
  subject: string;
  html: string;
}

interface WelcomeTemplateParams {
  firstName?: string;
  appUrl: string;
}

export function buildWelcomeEmail({ firstName, appUrl }: WelcomeTemplateParams): EmailTemplate {
  const name = firstName?.trim() || "there";
  const safeAppUrl = appUrl.replace(/\/$/, "");

  const subject = "Welcome to TweetReply";

  const html = `<!DOCTYPE html>
<html>
  <body>
    <h1>Welcome to TweetReply, ${name}!</h1>
    <p>Thanks for signing up. Here are a few things you can do right away:</p>
    <ul>
      <li>Generate high-quality tweet replies in one click</li>
      <li>Use different tones and styles for your replies</li>
      <li>Track your usage from your dashboard</li>
    </ul>
    <p>
      <a href="${safeAppUrl}" target="_blank" rel="noopener noreferrer">
        Open your dashboard
      </a>
    </p>
  </body>
</html>`;

  return { subject, html };
}

